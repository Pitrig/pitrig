#include "dashboard_layout_internal.hpp"

namespace simcore::dashboard {
namespace {

#if SIMCORE_LAYOUT_DEBUG
constexpr std::uint32_t kBlockOutlineColorRgb = 0x00E5FF;
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

[[nodiscard]] lv_align_t to_lv_align(const Anchor anchor) {
  switch (anchor) {
    case Anchor::top_left:
      return LV_ALIGN_TOP_LEFT;
    case Anchor::top_center:
      return LV_ALIGN_TOP_MID;
    case Anchor::top_right:
      return LV_ALIGN_TOP_RIGHT;
    case Anchor::left_center:
      return LV_ALIGN_LEFT_MID;
    case Anchor::center:
      return LV_ALIGN_CENTER;
    case Anchor::right_center:
      return LV_ALIGN_RIGHT_MID;
    case Anchor::bottom_left:
      return LV_ALIGN_BOTTOM_LEFT;
    case Anchor::bottom_center:
      return LV_ALIGN_BOTTOM_MID;
    case Anchor::bottom_right:
      return LV_ALIGN_BOTTOM_RIGHT;
  }

  return LV_ALIGN_CENTER;
}

}  // namespace

lv_obj_t* create_widget_block(lv_obj_t* const screen,
                              const WidgetBlock& block) {
  lv_obj_t* const container = lv_obj_create(screen);
  lv_obj_remove_style_all(container);
  lv_obj_set_pos(container, block.x, block.y);
  lv_obj_set_size(container, block.width, block.height);
  lv_obj_remove_flag(container, LV_OBJ_FLAG_SCROLLABLE);
#if SIMCORE_LAYOUT_DEBUG
  apply_outline(container, kBlockOutlineColorRgb);
#endif
  return container;
}

void place_in_block(lv_obj_t* const object, const Placement& placement) {
  lv_obj_align(object, to_lv_align(placement.anchor), placement.offset_x,
               placement.offset_y);
}

#if SIMCORE_LAYOUT_DEBUG
void apply_debug_widget_outline(lv_obj_t* const object) {
  apply_outline(object, kWidgetOutlineColorRgb);
}
#endif

}  // namespace simcore::dashboard
