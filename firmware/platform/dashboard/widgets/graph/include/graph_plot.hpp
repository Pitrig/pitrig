#pragma once

#include <cstdint>

#include "graph_widget.hpp"
#include "lvgl.h"

namespace pitrig::dashboard::graph_widget::plot {

[[nodiscard]] std::int32_t line_reserve(std::uint16_t line_width_px);

[[nodiscard]] std::int32_t corner_reserve(std::uint16_t radius_px,
                                          std::int32_t border_px);

[[nodiscard]] float sample_y(std::int32_t plot_height, float fraction);

inline constexpr float kSubPixel = 16.0F;

void clear_columns(const State& state, lv_layer_t& layer, std::int32_t from,
                   std::int32_t count);

void draw_segment(const State& state, lv_layer_t& layer, std::uint32_t rgb,
                  std::int32_t x0, float y0, std::int32_t x1, float y1);

}
