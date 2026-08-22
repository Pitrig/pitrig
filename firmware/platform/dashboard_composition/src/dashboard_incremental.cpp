#include "dashboard_composition.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_assets.hpp"
#include "dashboard_screens.hpp"
#include "dashboard_state.hpp"
#include "dashboard_storages.hpp"
#include "esp_lvgl_port.h"
#include "logger.hpp"
#include "lvgl.h"
#include "widget_frame.hpp"

#include "dashboard_incremental_rules.hpp"
// Applying a replacement document without rebuilding the dashboard. A widget
// whose bytes are unchanged keeps its LVGL object; only what actually differs
// is touched. The rules for what counts as unchanged are subtle enough — a
// screen recolour reaches a widget only through a caption mask that reads the
// parent, a container is restyled rather than rebuilt because its object is the
// parent of widgets other collections own — that they are worth reading apart
// from the full composition they fall back to.
//
// Two orderings carry most of the correctness here. Types are walked in the
// order the widget manager registered them, which is containers first, so a
// widget is built after the parent it resolves and after that parent's own
// geometry and colour are final. And the pools are addressed by index rather
// than by identity: the parser numbers widgets in document order, so a widget
// added or moved renumbers the ones after it, and the byte compare below sees
// exactly the slots whose contents changed — whichever widget now occupies them.
namespace simcore::dashboard_composition {
namespace {

constexpr char kTag[] = "dashboard";

using incremental::is_container;
using incremental::needs_update;
using incremental::repainted_containers;

// Falling back is not a failure — it is the path that can answer for anything —
// but it costs a whole rebuild of the display, so it says why.
[[nodiscard]] bool decline(const char* const reason) {
  log::info(kTag, "Incremental apply declined: %s", reason);
  return false;
}

// Creates the screens a replacement added and points everything that resolves a
// screen at the longer set: the layout each widget type places through, and the
// navigation that swipes between them. Widgets on the new screens are additions
// to their pools and are built by the pass itself.
[[nodiscard]] bool add_screens(
    const configuration::DashboardConfiguration& before,
    const configuration::ApplicationConfiguration& next, Dashboard& dashboard) {
  lv_display_t* const display = dashboard.slot.layout.display;
  if (display == nullptr || !lvgl_port_lock(0)) {
    return false;
  }
  const std::size_t count =
      screens::extend(display, next, dashboard, before.screen_count);
  const bool added = count >= next.dashboard.screen_count;
  if (added) {
    const std::span<lv_obj_t* const> screens =
        std::span{dashboard.screens}.first(count);
    for (WidgetStorage* const storage : storages(dashboard)) {
      storage->layout.screens = screens;
    }
    // Re-attached rather than extended: attach() detaches first, so the set it
    // ends up watching is the one handed to it. It also drops the tap targets,
    // which this pass rebinds at the end anyway.
    dashboard.navigation.attach(screens);
  }
  lvgl_port_unlock();
  return added;
}

// Repaints the screens whose colour changed and reports which those were.
[[nodiscard]] bool recolour_screens(
    const configuration::DashboardConfiguration& before,
    const configuration::DashboardConfiguration& after, Dashboard& dashboard,
    std::uint32_t& recoloured) {
  static_assert(configuration::kMaximumScreens <= 32,
                "The recoloured-screen set is one bit per screen");
  recoloured = 0;
  for (std::size_t index = 0; index < after.screen_count; ++index) {
    if (before.screens[index].background_color ==
        after.screens[index].background_color) {
      continue;
    }
    if (!lvgl_port_lock(0)) {
      return false;
    }
    lv_obj_set_style_bg_color(
        dashboard.screens[index],
        lv_color_hex(after.screens[index].background_color), LV_PART_MAIN);
    lvgl_port_unlock();
    recoloured |= 1U << index;
  }
  return true;
}

}  // namespace

bool apply_incremental(
    const configuration::ApplicationConfiguration& previous,
    const configuration::ApplicationConfiguration& next, Dashboard& dashboard) {
  const configuration::DashboardConfiguration& before = previous.dashboard;
  const configuration::DashboardConfiguration& after = next.dashboard;

  // A screen removed is deleted with everything standing on it, and what stood
  // on it is addressed by pool index like every other widget — so this pass
  // would be holding state for objects LVGL had already taken down. Adding one
  // is the opposite: an empty screen nothing points at yet.
  if (after.screen_count < before.screen_count) {
    return decline("screen removed");
  }
  if (after.screen_count > before.screen_count &&
      !add_screens(before, next, dashboard)) {
    return decline("screen could not be added");
  }

  // A widget whose font changed is rebuilt below and resolves the new font
  // then, so every font the new document names has to exist first. Old fonts
  // stay until the end: a widget not yet rebuilt is still drawing with one.
  // A registry that cannot take the new fonts beside the old ones sends the
  // whole apply down the full path, which releases before it acquires.
  if (!assets::acquire_fonts(next, dashboard.fonts)) {
    return decline("font registry cannot hold both documents");
  }

  // Every tap target is unbound now, while the objects it was bound to still
  // exist; the pass below replaces some of them, and the pass at the end binds
  // onto whatever the document has after that.
  //
  // The slot controller is unbound here for the same reason, and it is the
  // stronger one: it holds each slot's container and page objects, and the walk
  // below is free to rebuild a slot or release one the document dropped. Left
  // until the rebind at the end, its pointers would by then name freed memory
  // and clearing it would be the first thing to read them — which is a load
  // from a deleted LVGL object, not a stale value. This is the order destroy()
  // uses, and what Controller::clear() means by "the composition clears the
  // controller before it deletes them".
  const bool had_slots = before.slot_widget_count != 0;
  if (!lvgl_port_lock(0)) {
    return decline("LVGL is busy");
  }
  dashboard.navigation.clear_actions();
  // Not conditional on anything: a document may change how it moves between
  // screens and nothing else, which is an edit no widget pass would notice.
  dashboard.navigation.set_transition(after.transition);
  if (had_slots) {
    dashboard.slots.clear();
  }
  lvgl_port_unlock();

  // Widget contexts point into the document that was active when they were
  // built. Promotion swapped that out, so repoint them before rebuilding.
  for (WidgetStorage* const storage : storages(dashboard)) {
    storage->dashboard = &after;
  }

  std::uint32_t recoloured_screens = 0;
  if (!recolour_screens(before, after, dashboard, recoloured_screens)) {
    return decline("LVGL is busy");
  }
  const std::uint32_t repainted = repainted_containers(before, after);

  // Decided before anything moves rather than discovered along the way: the
  // controller was dropped above, so a document that had slots — or that has
  // them now — has to be rebound whatever the walk does to them.
  const bool slots_touched = had_slots || after.slot_widget_count != 0;

  // Containers first, which is the order the manager registered its types in.
  // A widget resolves its parent as it builds, so the parent's object has to
  // exist and to have settled where it stands before anything inside it does.
  for (std::size_t entry = 0; entry < dashboard.widgets.type_count(); ++entry) {
    const configuration::WidgetType type = dashboard.widgets.type_at(entry);
    const configuration::WidgetTypeTraits& traits =
        configuration::widget_traits(type);
    const std::uint8_t previous_count = traits.count(before);
    const std::uint8_t count = traits.count(after);
    // A container's pool only grows here. Shrinking it deletes an object that
    // is still the LVGL parent of widgets this pass has not reached yet, and it
    // would take them down with it; by the end of the walk every widget that
    // survived has been rebuilt into the parent it now belongs to, and the
    // container is holding nothing.
    if (!(is_container(type) && count < previous_count) &&
        !dashboard.widgets.sync_count(type, count)) {
      return decline("widget pool cannot be resized");
    }
    for (std::uint8_t index = 0; index < count; ++index) {
      if (!needs_update(traits, before, after, index, previous_count,
                        recoloured_screens, repainted)) {
        continue;
      }
      if (!dashboard.widgets.update_instance(type, index)) {
        return decline("a widget could not be updated in place");
      }
    }
  }
  // The containers a replacement removed, deepest first: a shape may stand on a
  // slot's page, so shapes go before slots — which is the registration order
  // walked backwards, the same order the composition tears a dashboard down in.
  for (std::size_t entry = dashboard.widgets.type_count(); entry > 0; --entry) {
    const configuration::WidgetType type = dashboard.widgets.type_at(entry - 1);
    const configuration::WidgetTypeTraits& traits =
        configuration::widget_traits(type);
    if (!is_container(type) || traits.count(after) >= traits.count(before)) {
      continue;
    }
    if (!dashboard.widgets.sync_count(type, traits.count(after))) {
      return decline("a container could not be released");
    }
  }

  // What a container that refuses to clip has to let through is a fact about
  // where its children ended up, so moving or resizing one changes it — and
  // that is exactly the edit this path takes. Without re-measuring, the
  // overflow stays whatever the last full composition saw, and LVGL clips a
  // widget dragged past its container's edge to a box that no longer describes
  // it. The same call settles a container whose clip_children itself changed.
  if (!screens::apply_container_clipping(next, dashboard)) {
    return decline("LVGL is busy");
  }
  // Rebuilt widgets are new LVGL children, so they sit on top until the
  // configured order is applied again — and a widget that moved to another
  // parent is ordered among its new siblings here.
  if (!screens::apply_z_order(next, dashboard)) {
    return decline("LVGL is busy");
  }
  // The controller holds a copy of what each page watches and points at the
  // page objects, so a slot that changed at all is rebound — once, after every
  // slot has been updated.
  if (slots_touched) {
    if (!lvgl_port_lock(0)) {
      return decline("LVGL is busy");
    }
    const bool attached = screens::attach_slots(next, dashboard);
    lvgl_port_unlock();
    if (!attached) {
      return decline("a slot could not be rebound");
    }
  }
  // Onto whatever objects the document has now, rebuilt or kept.
  if (!screens::bind_actions(next, dashboard)) {
    return decline("a tap target could not be bound");
  }
  // Every widget now draws from the new document, so the fonts only the old
  // one named have no reader left.
  assets::release_unused_fonts(next, dashboard.fonts);
  return true;
}

}  // namespace simcore::dashboard_composition
