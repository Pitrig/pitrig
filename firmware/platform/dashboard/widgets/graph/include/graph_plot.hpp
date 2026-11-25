#pragma once

#include <cstdint>

#include "graph_widget.hpp"
#include "lvgl.h"

namespace pitrig::dashboard::graph_widget::plot {

[[nodiscard]] std::int32_t line_reserve(std::uint16_t line_width_px);

[[nodiscard]] float sample_y(std::int32_t plot_height, float fraction);

inline constexpr float kSubPixel = 16.0F;

[[nodiscard]] float line_radius(const State& state);

[[nodiscard]] std::int32_t sweep_oldest_age(const State& state);

[[nodiscard]] float sweep_x(const State& state, std::uint32_t sequence);

void invalidate(const State& state, std::uint32_t previous_sequence);

}
