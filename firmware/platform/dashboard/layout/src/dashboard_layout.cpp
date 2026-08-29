#include "dashboard_layout_internal.hpp"

#include "esp_lvgl_port.h"

namespace simcore::dashboard {
namespace {

#if SIMCORE_LAYOUT_DEBUG
constexpr std::uint32_t kWidgetOutlineColorRgb = 0xFF2D95;
constexpr std::int32_t kDebugOutlineWidthPx = 1;
constexpr std::int32_t kDebugOutlinePadPx = -1;

void apply_outline(lv_obj_t* const object, const std::uint32_t color_rgb) {
  lv_obj_set_style_outline_width(object, kDebugOutlineWidthPx, LV_PART_MAIN);
  lv_obj_set_style_outline_pad(object, kDebugOutlinePadPx, LV_PART_MAIN);
  lv_obj_set_style_outline_color(object, lv_color_hex(color_rgb), LV_PART_MAIN);
  lv_obj_set_style_outline_opa(object, LV_OPA_COVER, LV_PART_MAIN);
}
#endif

}

bool resolve_widget_bounds(const Layout& layout,
                           const configuration::WidgetFrame& frame,
                           const Placement& placement,
                           const std::int32_t intrinsic_width,
                           const std::int32_t intrinsic_height,
                           const bool fill_available_width, lv_obj_t*& parent,
                           Rect& bounds) {
  lv_obj_t* const owner = layout.parent(frame);
  const bool contained =
      frame.parent_kind != configuration::WidgetParentKind::screen;
  if (layout.display == nullptr || owner == nullptr || intrinsic_width < 0 ||
      intrinsic_height < 0 || placement.width < 0 || placement.height < 0) {
    return false;
  }

  parent = owner;
  const std::int32_t content_left =
      contained ? lv_obj_get_style_space_left(owner, LV_PART_MAIN) : 0;
  const std::int32_t content_top =
      contained ? lv_obj_get_style_space_top(owner, LV_PART_MAIN) : 0;
  const std::int32_t parent_width =
      contained ? lv_obj_get_width(owner)
                : lv_display_get_horizontal_resolution(layout.display);

  const std::int32_t requested_width =
      placement.width > 0
          ? placement.width
          : (fill_available_width ? parent_width - placement.x
                                  : intrinsic_width);
  const std::int32_t requested_height =
      placement.height > 0 ? placement.height : intrinsic_height;
  bounds = {.x = placement.x - content_left,
            .y = placement.y - content_top,
            .width = requested_width,
            .height = requested_height};
  if (bounds.width <= 0 || bounds.height <= 0) {
    return false;
  }
  lv_area_t parent_box{};
  lv_obj_get_coords(owner, &parent_box);
  const std::int32_t left = parent_box.x1 + content_left + bounds.x;
  const std::int32_t top = parent_box.y1 + content_top + bounds.y;
  return left + bounds.width > 0 && top + bounds.height > 0 &&
         left < lv_display_get_horizontal_resolution(layout.display) &&
         top < lv_display_get_vertical_resolution(layout.display);
}

#if SIMCORE_LAYOUT_DEBUG
void apply_debug_widget_outline(lv_obj_t* const object) {
  apply_outline(object, kWidgetOutlineColorRgb);
}
#endif

}
