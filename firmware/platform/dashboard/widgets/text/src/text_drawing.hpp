#pragma once

#include "lvgl.h"
#include "text_widget.hpp"

namespace simcore::dashboard::text_widget::drawing {

[[nodiscard]] std::int32_t text_width_of(const lv_font_t* font,
                                         const char* text);

[[nodiscard]] lv_area_t value_area(const State& state,
                                   const lv_area_t& content);

void invalidate_value(const State& state, const lv_area_t* previous);

void draw_value(lv_event_t* event);

void apply_value_color(void* context, std::uint32_t rgb);

}
