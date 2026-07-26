#pragma once

#include <cstdint>

#include "dashboard_layout.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::dashboard::lap_timer_widget {

struct Config {
  WidgetBlock block{};
  FontSpec font{};
  Placement placement{};
  std::uint32_t text_color_rgb{0xE8E8E8};
};

// Creates the lap timer label and its periodic render callback.
void create(lv_display_t* display, const Config& config);

}  // namespace simcore::dashboard::lap_timer_widget
