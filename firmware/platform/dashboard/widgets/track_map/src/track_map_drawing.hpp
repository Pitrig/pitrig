#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "lvgl.h"
#include "track_map.hpp"
#include "track_map_widget.hpp"

namespace pitrig::dashboard::track_map_widget::drawing {

void draw_outline(const State& state);

[[nodiscard]] std::size_t place_cars(const State& state, std::span<const track_map::Car> cars,
                                     std::span<Dot> dots);

[[nodiscard]] std::size_t damage(const State& state, std::span<const Dot> before,
                                 std::span<const Dot> after, const lv_area_t& origin,
                                 std::span<DamagedDot> scratch, std::span<lv_area_t> areas);

[[nodiscard]] lv_draw_buf_t* make_sprite(float diameter, std::int32_t column, std::int32_t row);

void draw_cars(lv_event_t* event);

}
