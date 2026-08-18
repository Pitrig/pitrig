#include "dashboard_screens.hpp"
#include "dashboard_state.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <span>
#include <string_view>

#include "application_configuration.hpp"
#include "logger.hpp"
#include "simcore_features.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "dashboard_screens.hpp"

// A container does not clip its children: a caption or a widget that overhangs
// its box is still drawn, and only the display bounds it. LVGL clips by
// default, so the overhang has to be measured and the clip lifted by exactly
// that much.
namespace simcore::dashboard_composition::screens {
namespace {

void report_container_overflow(lv_event_t* const event) {
  const auto* const overflow =
      static_cast<const std::int32_t*>(lv_event_get_user_data(event));
  if (overflow != nullptr) {
    lv_event_set_ext_draw_size(event, *overflow);
  }
}

// How far one child reaches beyond its own box. Only a container does — a shape
// holding widgets, or one page of a slot — and only by the amount this pass
// already measured for it, so the answer is a lookup in the table rather than a
// second measurement. A slot itself is never a child of anything measured here,
// because a slot is only ever authored on a screen.
[[nodiscard]] std::int32_t child_overflow(const Dashboard& dashboard,
                                          const lv_obj_t* const object) {
  for (std::size_t index = 0; index < dashboard.containers.size(); ++index) {
    if (dashboard.containers[index] == object) {
      return dashboard.container_overflow[index];
    }
  }
  for (std::size_t index = 0; index < dashboard.pages.size(); ++index) {
    if (dashboard.pages[index] == object) {
      return dashboard.page_overflow[index];
    }
  }
  return 0;
}

// How far one container's own children reach past its box. Written once because
// a container shape, a slot page and a slot all answer it the same way.
//
// LVGL children rather than the reference table: a caption and its border mask
// are parented to the container and appear in no table, and a clipped caption is
// the whole reason this measurement exists.
[[nodiscard]] std::int32_t measure_overflow(const Dashboard& dashboard,
                                            lv_obj_t* const container) {
  lv_area_t box{};
  lv_obj_get_coords(container, &box);
  std::int32_t overflow = 0;
  const std::uint32_t children = lv_obj_get_child_count(container);
  for (std::uint32_t child = 0; child < children; ++child) {
    lv_obj_t* const object = lv_obj_get_child(container, child);
    if (object == nullptr) {
      continue;
    }
    lv_area_t reach{};
    lv_obj_get_coords(object, &reach);
    // What this child in turn lets through. Read from what this pass already
    // measured rather than from LVGL, whose accessor is private — and the
    // caller orders its containers deepest-first precisely so a nested one's
    // figure is final by the time its parent folds it in. Anything else
    // contributes nothing: no widget here draws a shadow or an outline outside
    // its box.
    const std::int32_t own = child_overflow(dashboard, object);
    overflow = std::max({overflow, box.x1 - (reach.x1 - own),
                         (reach.x2 + own) - box.x2, box.y1 - (reach.y1 - own),
                         (reach.y2 + own) - box.y2});
  }
  return std::max<std::int32_t>(overflow, 0);
}

// Lets a container draw outside its box by the amount measured for it. The
// pointer is into the dashboard's own array, which outlives the object.
//
// Idempotent, because an incremental apply re-measures containers that were
// never rebuilt: the handler is dropped before it is attached again, so running
// this twice on one object leaves one handler rather than two.
void unclip(lv_obj_t* const container, std::int32_t& overflow) {
  lv_obj_add_flag(container, LV_OBJ_FLAG_OVERFLOW_VISIBLE);
  (void)lv_obj_remove_event_cb_with_user_data(
      container, report_container_overflow, &overflow);
  lv_obj_add_event_cb(container, report_container_overflow,
                      LV_EVENT_REFR_EXT_DRAW_SIZE, &overflow);
  lv_obj_refresh_ext_draw_size(container);
}


}  // namespace


bool unclip_containers(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard) {
  const configuration::DashboardConfiguration& document = configuration.dashboard;
  if (!lvgl_port_lock(0)) {
    return false;
  }
  // Deepest first, so a nested container's own extra draw size is already final
  // when the container above it folds that in. Shapes come first in reverse pool
  // order — the pool is ordered parent-before-child, which is what makes one
  // pass exact at any depth — then the pages that may hold them, then the slots
  // that hold the pages.
  for (std::size_t index = document.shape_widget_count; index > 0; --index) {
    const std::size_t slot = index - 1;
    lv_obj_t* const container = dashboard.containers[slot];
    if (container == nullptr || document.shape_widgets[slot].widget_count == 0) {
      continue;
    }
    dashboard.container_overflow[slot] = measure_overflow(dashboard, container);
    unclip(container, dashboard.container_overflow[slot]);
  }
  for (std::size_t index = 0; index < document.slot_widget_count; ++index) {
    const configuration::SlotWidgetConfiguration& widget =
        document.slot_widgets[index];
    lv_obj_t* const container = dashboard.slot.collection.root_object(index);
    if (container == nullptr) {
      continue;
    }
    for (std::size_t page = 0; page < widget.page_count; ++page) {
      const std::size_t flat = index * configuration::kMaximumSlotPages + page;
      lv_obj_t* const object = dashboard.pages[flat];
      if (object == nullptr) {
        continue;
      }
      // The page already refuses to clip — the slot collection sets that as it
      // builds — so what is added here is the measured size, without which LVGL
      // would invalidate only the page's own box.
      dashboard.page_overflow[flat] = measure_overflow(dashboard, object);
      unclip(object, dashboard.page_overflow[flat]);
    }
    dashboard.slot_overflow[index] = measure_overflow(dashboard, container);
    unclip(container, dashboard.slot_overflow[index]);
  }
  lvgl_port_unlock();
  return true;
}

}  // namespace simcore::dashboard_composition::screens
