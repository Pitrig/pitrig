#include "text_drawing.hpp"

#include <algorithm>

#include "lvgl.h"

namespace simcore::dashboard::text_widget::drawing {

std::int32_t text_width_of(const lv_font_t* const font, const char* const text) {
  lv_point_t size{};
  lv_text_get_size(&size, text, font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
  return size.x;
}

namespace {

[[nodiscard]] lv_text_align_t lv_text_alignment(const Alignment alignment) {
  switch (alignment) {
    case Alignment::top_left:
    case Alignment::left:
    case Alignment::bottom_left:
      return LV_TEXT_ALIGN_LEFT;
    case Alignment::top_center:
    case Alignment::center:
    case Alignment::bottom_center:
      return LV_TEXT_ALIGN_CENTER;
    case Alignment::top_right:
    case Alignment::right:
    case Alignment::bottom_right:
      return LV_TEXT_ALIGN_RIGHT;
  }
  return LV_TEXT_ALIGN_CENTER;
}

}

[[nodiscard]] lv_area_t value_area(const State& state,
                                   const lv_area_t& content) {
  const std::int32_t width = state.full_width ? lv_area_get_width(&content)
                                              : state.text_width;
  const std::int32_t height = state.value_height;
  const std::int32_t free_x = lv_area_get_width(&content) - width;
  const std::int32_t free_y = lv_area_get_height(&content) - height;
  std::int32_t x = 0;
  std::int32_t y = 0;
  switch (state.alignment) {
    case Alignment::top_center:
    case Alignment::center:
    case Alignment::bottom_center:
      x = free_x / 2;
      break;
    case Alignment::top_right:
    case Alignment::right:
    case Alignment::bottom_right:
      x = free_x;
      break;
    default:
      break;
  }
  switch (state.alignment) {
    case Alignment::left:
    case Alignment::center:
    case Alignment::right:
      y = free_y / 2;
      break;
    case Alignment::bottom_left:
    case Alignment::bottom_center:
    case Alignment::bottom_right:
      y = free_y;
      break;
    default:
      break;
  }
  y += state.offset_y;
  return {content.x1 + x, content.y1 + y, content.x1 + x + width - 1,
          content.y1 + y + height - 1};
}

void invalidate_value(const State& state, const lv_area_t* const previous) {
  if (state.container == nullptr) {
    return;
  }
  lv_area_t content{};
  lv_obj_get_content_coords(state.container, &content);
  lv_area_t area = value_area(state, content);
  if (previous != nullptr) {
    area = {std::min(area.x1, previous->x1), std::min(area.y1, previous->y1),
            std::max(area.x2, previous->x2), std::max(area.y2, previous->y2)};
  }
  (void)lv_obj_invalidate_area(state.container, &area);
}

void draw_value(lv_event_t* const event) {
  auto* const state = static_cast<State*>(lv_event_get_user_data(event));
  lv_layer_t* const layer = lv_event_get_layer(event);
  if (state == nullptr || layer == nullptr || state->container == nullptr ||
      state->font == nullptr || state->displayed_text.front() == '\0') {
    return;
  }
  lv_area_t content{};
  lv_obj_get_content_coords(state->container, &content);
  lv_draw_label_dsc_t dsc{};
  lv_draw_label_dsc_init(&dsc);
  dsc.text = state->displayed_text.data();
  dsc.font = state->font;
  dsc.color = lv_color_hex(state->color);
  dsc.align = state->full_width ? lv_text_alignment(state->alignment)
                                : LV_TEXT_ALIGN_LEFT;
  const lv_area_t area = value_area(*state, content);
  lv_draw_label(layer, &dsc, &area);
}

void apply_value_color(void* const context, const std::uint32_t rgb) {
  auto* const state = static_cast<State*>(context);
  if (state == nullptr || state->color == rgb) {
    return;
  }
  state->color = rgb;
  invalidate_value(*state, nullptr);
}

}
