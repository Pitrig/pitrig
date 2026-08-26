#include "dashboard_screens.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>

#include "application_configuration.hpp"
#include "dashboard_state.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard_composition::screens {
namespace {

void report_container_overflow(lv_event_t* const event) {
  const auto* const overflow =
      static_cast<const std::int32_t*>(lv_event_get_user_data(event));
  if (overflow != nullptr) {
    lv_event_set_ext_draw_size(event, *overflow);
  }
}

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
    const std::int32_t own = child_overflow(dashboard, object);
    overflow = std::max({overflow, box.x1 - (reach.x1 - own),
                         (reach.x2 + own) - box.x2, box.y1 - (reach.y1 - own),
                         (reach.y2 + own) - box.y2});
  }
  return std::max<std::int32_t>(overflow, 0);
}

void unclip(lv_obj_t* const container, std::int32_t& overflow) {
  lv_obj_add_flag(container, LV_OBJ_FLAG_OVERFLOW_VISIBLE);
  (void)lv_obj_remove_event_cb_with_user_data(
      container, report_container_overflow, &overflow);
  lv_obj_add_event_cb(container, report_container_overflow,
                      LV_EVENT_REFR_EXT_DRAW_SIZE, &overflow);
  lv_obj_refresh_ext_draw_size(container);
}

void clip(lv_obj_t* const container, std::int32_t& overflow) {
  overflow = 0;
  lv_obj_remove_flag(container, LV_OBJ_FLAG_OVERFLOW_VISIBLE);
  (void)lv_obj_remove_event_cb_with_user_data(
      container, report_container_overflow, &overflow);
  lv_obj_refresh_ext_draw_size(container);
}

void settle(const Dashboard& dashboard, lv_obj_t* const container,
            std::int32_t& overflow, const bool clip_children) {
  if (clip_children) {
    clip(container, overflow);
    return;
  }
  overflow = measure_overflow(dashboard, container);
  unclip(container, overflow);
}

}


bool apply_container_clipping(
    const configuration::ApplicationConfiguration& configuration,
    Dashboard& dashboard) {
  const configuration::DashboardConfiguration& document = configuration.dashboard;
  if (!lvgl_port_lock(0)) {
    return false;
  }
  for (std::size_t index = document.shape_widget_count; index > 0; --index) {
    const std::size_t slot = index - 1;
    lv_obj_t* const container = dashboard.containers[slot];
    if (container == nullptr || document.shape_widgets[slot].widget_count == 0) {
      continue;
    }
    settle(dashboard, container, dashboard.container_overflow[slot],
           document.shape_widgets[slot].clip_children);
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
      settle(dashboard, object, dashboard.page_overflow[flat],
             widget.clip_children);
    }
    settle(dashboard, container, dashboard.slot_overflow[index],
           widget.clip_children);
  }
  lvgl_port_unlock();
  return true;
}

}
