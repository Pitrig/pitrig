#pragma once

#include <cstdint>

#include "bar_widget.hpp"

namespace pitrig::dashboard::bar_widget::draw {

void attach(State& state);

void set_stops(State& state);

void invalidate_fill(const State& state);

void invalidate_moved(const State& state, std::int32_t old_offset, std::int32_t old_length);

}
