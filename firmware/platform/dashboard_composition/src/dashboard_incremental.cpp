#include "dashboard_composition.hpp"

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
#include "lvgl.h"
#include "widget_frame.hpp"

// Applying a replacement document without rebuilding the dashboard. A widget
// whose bytes are unchanged keeps its LVGL object; only what actually differs
// is rebuilt. The rules for what counts as unchanged are subtle enough — a
// screen recolour reaches a widget only through a caption mask that reads the
// parent, a container shape cannot be rebuilt in place — that they are worth
// reading apart from the full composition they fall back to.
namespace simcore::dashboard_composition {
namespace {

// Whether this widget's caption mask takes its colour from one of the screens
// in `recoloured`, and so has to be rebuilt for that colour to reach it. The
// rule for which masks read the parent belongs to the frame that builds them.
[[nodiscard]] bool caption_masks_screen(
    const configuration::WidgetFrame* const frame,
    const std::uint32_t recoloured) {
  if (frame == nullptr || frame->title.text.front() == '\0' ||
      frame->border.width_px == 0 ||
      !dashboard::frame::caption_mask_reads_parent(*frame)) {
    return false;
  }
  return (recoloured & (1U << frame->screen_index)) != 0;
}

}  // namespace

bool apply_incremental(
    const configuration::ApplicationConfiguration& previous,
    const configuration::ApplicationConfiguration& next, Dashboard& dashboard) {
  const configuration::DashboardConfiguration& before = previous.dashboard;
  const configuration::DashboardConfiguration& after = next.dashboard;

  // A different widget set, order, or storage layout is structural: a screen's
  // reference table carries type, storage index, and the z_index ordering key,
  // so equal tables mean compositing cannot have changed either.
  if (before.screen_count != after.screen_count) {
    return false;
  }
  for (const configuration::WidgetTypeTraits& traits :
       configuration::kWidgetTypeTraits) {
    if (traits.count(before) != traits.count(after)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < after.screen_count; ++index) {
    const configuration::ScreenConfiguration& before_screen =
        before.screens[index];
    const configuration::ScreenConfiguration& after_screen =
        after.screens[index];
    if (before_screen.widget_count != after_screen.widget_count ||
        std::memcmp(before_screen.widgets.data(), after_screen.widgets.data(),
                    after_screen.widget_count *
                        sizeof(configuration::WidgetReference)) != 0) {
      return false;
    }
  }

  // A widget whose font changed is rebuilt below and resolves the new font
  // then, so every font the new document names has to exist first. Old fonts
  // stay until the end: a widget not yet rebuilt is still drawing with one.
  // A registry that cannot take the new fonts beside the old ones sends the
  // whole apply down the full path, which releases before it acquires.
  if (!assets::acquire_fonts(next, dashboard.fonts)) {
    return false;
  }

  // Every tap target is unbound now, while the objects it was bound to still
  // exist; the rebuild below replaces some of them, and the pass at the end
  // binds onto whatever the document has after that.
  if (!lvgl_port_lock(0)) {
    return false;
  }
  dashboard.navigation.clear_actions();
  lvgl_port_unlock();

  // Widget contexts point into the document that was active when they were
  // built. Promotion swapped that out, so repoint them before rebuilding.
  for (WidgetStorage* const storage : storages(dashboard)) {
    storage->dashboard = &after;
  }

  // One bit per screen, and a document holds at most kMaximumScreens of them.
  std::uint32_t recoloured_screens = 0;
  static_assert(configuration::kMaximumScreens <= 32,
                "The recoloured-screen set is one bit per screen");
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
    recoloured_screens |= 1U << index;
  }

  // Walking the pool rather than the reference tables compares each widget
  // once, whatever screen it belongs to, and cannot pair an index with the
  // wrong type's storage. Widget configurations are trivially copyable
  // aggregates, so a byte compare is an exact change test: padding can only
  // produce a false "changed", costing one extra rebuild, never a false
  // "unchanged".
  for (const configuration::WidgetTypeTraits& traits :
       configuration::kWidgetTypeTraits) {
    const std::uint8_t count = traits.count(after);
    for (std::uint8_t index = 0; index < count; ++index) {
      const std::span<const std::byte> left = traits.element_bytes(before, index);
      const std::span<const std::byte> right = traits.element_bytes(after, index);
      const bool changed =
          left.size() != right.size() ||
          std::memcmp(left.data(), right.data(), left.size()) != 0;
      // A caption mask resolves the colour behind the widget when the widget is
      // built, so a screen that changes colour leaves every mask standing on it
      // holding the old one. The widget's own bytes did not change, so the
      // compare above cannot see it; rebuilding is what re-runs the resolution.
      if (!changed &&
          !caption_masks_screen(traits.frame(after, index), recoloured_screens)) {
        continue;
      }
      // Rebuilding a container deletes its LVGL object, and LVGL takes the
      // descendants with it — children owned by other collections, and the slot
      // controller's pointers to the pages. Those are structural, so a shape
      // that holds children goes the full-recomposition route. The test is its
      // role rather than what changed: a colour edit trips the byte compare
      // above just the same, and would delete the children just the same. A
      // plain backing plate, which is most shapes, keeps the fast path. A slot
      // is always a container, and its own update_instance refuses outright.
      if (traits.type == configuration::WidgetType::shape &&
          after.shape_widgets[index].widget_count > 0) {
        return false;
      }
      if (!dashboard.widgets.update_instance(traits.type, index)) {
        return false;
      }
    }
  }

  // What a container that refuses to clip has to let through is a fact about
  // where its children ended up, so moving or resizing one changes it — and
  // that is exactly the edit this path takes. Without re-measuring, the
  // overflow stays whatever the last full composition saw, and LVGL clips a
  // widget dragged past its container's edge to a box that no longer describes
  // it. The same call settles a container whose clip_children itself changed.
  if (!screens::apply_container_clipping(next, dashboard)) {
    return false;
  }
  // Rebuilt widgets are new LVGL children, so they sit on top until the
  // configured order is applied again — and they are new objects, so their tap
  // actions have to be bound onto them again.
  if (!screens::apply_z_order(next, dashboard) ||
      !screens::bind_actions(next, dashboard)) {
    return false;
  }
  // Every widget now draws from the new document, so the fonts only the old
  // one named have no reader left.
  assets::release_unused_fonts(next, dashboard.fonts);
  return true;
}

}  // namespace simcore::dashboard_composition
