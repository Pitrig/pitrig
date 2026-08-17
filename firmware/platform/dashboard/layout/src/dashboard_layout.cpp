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

}  // namespace

bool resolve_widget_bounds(const Layout& layout, const Placement& placement,
                           const std::uint8_t screen_index,
                           const std::uint8_t group_index,
                           const bool group_present,
                           const std::int32_t intrinsic_width,
                           const std::int32_t intrinsic_height,
                           const bool fill_available_width, lv_obj_t*& parent,
                           Rect& bounds) {
  lv_obj_t* const owner =
      layout.parent(screen_index, group_index, group_present);
  if (layout.display == nullptr || owner == nullptr || intrinsic_width <= 0 ||
      intrinsic_height <= 0 || placement.x < 0 || placement.y < 0 ||
      placement.width < 0 || placement.height < 0) {
    return false;
  }

  parent = owner;
  // Geometry inside a group is relative to the group's box, so what bounds a
  // widget is its parent rather than the display. A group is sized before its
  // children are built, so this is its final size.
  const std::int32_t parent_width =
      group_present ? lv_obj_get_width(owner)
                    : lv_display_get_horizontal_resolution(layout.display);
  const std::int32_t parent_height =
      group_present ? lv_obj_get_height(owner)
                    : lv_display_get_vertical_resolution(layout.display);

  const std::int32_t requested_width =
      placement.width > 0
          ? placement.width
          : (fill_available_width ? parent_width - placement.x
                                  : intrinsic_width);
  const std::int32_t requested_height =
      placement.height > 0 ? placement.height : intrinsic_height;
  bounds = {.x = placement.x,
            .y = placement.y,
            .width = requested_width,
            .height = requested_height};
  if (bounds.width <= 0 || bounds.height <= 0 ||
      bounds.x + bounds.width > parent_width ||
      bounds.y + bounds.height > parent_height) {
    return false;
  }
  return true;
}

#if SIMCORE_LAYOUT_DEBUG
void apply_debug_widget_outline(lv_obj_t* const object) {
  apply_outline(object, kWidgetOutlineColorRgb);
}
#endif

}  // namespace simcore::dashboard
