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

bool resolve_widget_bounds(const Layout& layout,
                           const configuration::WidgetFrame& frame,
                           const Placement& placement,
                           const std::int32_t intrinsic_width,
                           const std::int32_t intrinsic_height,
                           const bool fill_available_width, lv_obj_t*& parent,
                           Rect& bounds) {
  lv_obj_t* const owner = layout.parent(frame);
  // A container supplies the size an unsized widget fills, and the display does
  // so for a widget the screen owns. Which of the two applies is the one thing
  // the parent kind decides here.
  const bool contained =
      frame.parent_kind != configuration::WidgetParentKind::screen;
  // Zero intrinsic is an answer, not a failure: a shape asks for no content of
  // its own, so a container with no caption, border or padding needs exactly
  // nothing — and that is the ordinary container. What refuses a widget with no
  // size is the bounds test below, once the placement has had its say.
  if (layout.display == nullptr || owner == nullptr || intrinsic_width < 0 ||
      intrinsic_height < 0 || placement.width < 0 || placement.height < 0) {
    return false;
  }

  parent = owner;
  // Filling means filling the parent, so a container still supplies the size an
  // unsized widget takes. It is built before its children, so this is final.
  const std::int32_t parent_width =
      contained ? lv_obj_get_width(owner)
                : lv_display_get_horizontal_resolution(layout.display);
  const std::int32_t parent_height =
      contained ? lv_obj_get_height(owner)
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
  if (bounds.width <= 0 || bounds.height <= 0) {
    return false;
  }
  // A container does not bound its children — they are drawn where they land,
  // overhang included. The display is the one edge with nothing beyond it, so a
  // box entirely outside it is the only geometry refused here. LVGL keeps
  // `coords` absolute, so the parent's own position is the whole conversion and
  // no walk up the parent chain is needed; a screen sits at (0,0), which is why
  // the unparented case needs no branch.
  lv_area_t parent_box{};
  lv_obj_get_coords(owner, &parent_box);
  const std::int32_t left = parent_box.x1 + bounds.x;
  const std::int32_t top = parent_box.y1 + bounds.y;
  return left + bounds.width > 0 && top + bounds.height > 0 &&
         left < lv_display_get_horizontal_resolution(layout.display) &&
         top < lv_display_get_vertical_resolution(layout.display);
}

#if SIMCORE_LAYOUT_DEBUG
void apply_debug_widget_outline(lv_obj_t* const object) {
  apply_outline(object, kWidgetOutlineColorRgb);
}
#endif

}  // namespace simcore::dashboard
