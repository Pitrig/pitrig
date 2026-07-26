#include "dashboard_layout_internal.hpp"

namespace simcore::dashboard {
namespace {

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
  return container;
}

void place_in_block(lv_obj_t* const object, const Placement& placement) {
  lv_obj_align(object, to_lv_align(placement.anchor), placement.offset_x,
               placement.offset_y);
}

}  // namespace simcore::dashboard
