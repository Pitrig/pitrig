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

// Falling back is not a failure — it is the path that can answer for anything —
// but it costs a whole rebuild of the display, so it says why.
[[nodiscard]] bool decline(const char* const reason) {
  log::info(kTag, "Incremental apply declined: %s", reason);
  return false;
}

// Whether this widget's caption mask takes its colour from whatever it is
// standing on, rather than from the widget's own fill. The rule for which masks
// read the parent belongs to the frame that builds them; what such a mask is
// standing on is either its screen or the container it was authored in.
[[nodiscard]] bool caption_masks_parent(
    const configuration::WidgetFrame* const frame) {
  return frame != nullptr && frame->title.text.front() != '\0' &&
         frame->border.width_px != 0 &&
         dashboard::frame::caption_mask_reads_parent(*frame);
}

// A mask resolves what is behind the widget when the widget is built, so
// anything that repaints behind it leaves the mask holding the old colour. The
// widget's own bytes did not change, so the compare cannot see it; rebuilding is
// what re-runs the resolution.
[[nodiscard]] bool caption_masks_screen(
    const configuration::WidgetFrame* const frame,
    const std::uint32_t recoloured) {
  return caption_masks_parent(frame) &&
         (recoloured & (1U << frame->screen_index)) != 0;
}

[[nodiscard]] bool caption_masks_container(
    const configuration::WidgetFrame* const frame,
    const std::uint32_t repainted) {
  return caption_masks_parent(frame) &&
         frame->parent_kind == configuration::WidgetParentKind::shape &&
         frame->parent_index < 32 &&
         (repainted & (1U << frame->parent_index)) != 0;
}

// A type whose objects are the LVGL parents of other widgets. What makes these
// two special everywhere in this pass: they are updated before what they hold
// and released after it.
[[nodiscard]] bool is_container(const configuration::WidgetType type) {
  return type == configuration::WidgetType::shape ||
         type == configuration::WidgetType::slot;
}

// The containers whose paint changed, one bit per pool index. Only the fields a
// mask actually reads count: it copies the container's background colour, and an
// inset background moves the paint off the container altogether. A container
// this replacement added is not here — everything inside it is new too.
[[nodiscard]] std::uint32_t repainted_containers(
    const configuration::DashboardConfiguration& before,
    const configuration::DashboardConfiguration& after) {
  static_assert(configuration::kMaximumShapeWidgets <= 32,
                "The repainted-container set is one bit per shape pool slot");
  std::uint32_t repainted = 0;
  const std::uint8_t common =
      std::min(before.shape_widget_count, after.shape_widget_count);
  for (std::uint8_t index = 0; index < common; ++index) {
    const configuration::WidgetFrame& was = before.shape_widgets[index].frame;
    const configuration::WidgetFrame& now = after.shape_widgets[index].frame;
    if (was.background_color != now.background_color ||
        was.background_inset_px != now.background_inset_px) {
      repainted |= 1U << index;
    }
  }
  return repainted;
}

// Whether one pool slot has to be brought up to the replacement. A slot past
// what the previous document held is a widget this replacement added, and it is
// reserved empty: building it is the same call that rebuilds a changed one.
//
// Widget configurations are trivially copyable aggregates, so a byte compare is
// an exact change test: padding can only produce a false "changed", costing one
// extra rebuild, never a false "unchanged".
[[nodiscard]] bool needs_update(const configuration::WidgetTypeTraits& traits,
                                const configuration::DashboardConfiguration& before,
                                const configuration::DashboardConfiguration& after,
                                const std::uint8_t index,
                                const std::uint8_t previous_count,
                                const std::uint32_t recoloured_screens,
                                const std::uint32_t repainted) {
  if (index >= previous_count) {
    return true;
  }
  const std::span<const std::byte> left = traits.element_bytes(before, index);
  const std::span<const std::byte> right = traits.element_bytes(after, index);
  if (left.size() != right.size() ||
      std::memcmp(left.data(), right.data(), left.size()) != 0) {
    return true;
  }
  const configuration::WidgetFrame* const frame = traits.frame(after, index);
  return caption_masks_screen(frame, recoloured_screens) ||
         caption_masks_container(frame, repainted);
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
  if (!lvgl_port_lock(0)) {
    return decline("LVGL is busy");
  }
  dashboard.navigation.clear_actions();
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

  // Containers first, which is the order the manager registered its types in.
  // A widget resolves its parent as it builds, so the parent's object has to
  // exist and to have settled where it stands before anything inside it does.
  bool slots_touched = false;
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
    slots_touched = slots_touched || (type == configuration::WidgetType::slot &&
                                      count != previous_count);
    for (std::uint8_t index = 0; index < count; ++index) {
      if (!needs_update(traits, before, after, index, previous_count,
                        recoloured_screens, repainted)) {
        continue;
      }
      if (!dashboard.widgets.update_instance(type, index)) {
        return decline("a widget could not be updated in place");
      }
      slots_touched =
          slots_touched || type == configuration::WidgetType::slot;
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
    slots_touched =
        slots_touched || type == configuration::WidgetType::slot;
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
