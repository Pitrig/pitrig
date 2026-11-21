#pragma once

#include <cstddef>
#include <span>

#include "lvgl.h"
#include "track_map.hpp"
#include "track_map_widget.hpp"

namespace pitrig::dashboard::track_map_widget::drawing {

void draw_outline(const State& state);

[[nodiscard]] std::size_t place_cars(const State& state, std::span<const track_map::Car> cars,
                                     std::span<Dot> dots);

[[nodiscard]] bool cars_area(std::span<const Dot> dots, const lv_area_t& origin, lv_area_t& area);

void draw_cars(lv_event_t* event);

}
