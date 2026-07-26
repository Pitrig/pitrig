#pragma once

#include "dashboard_layout.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::dashboard::delta_time_widget {

struct ScaleStyle {
  std::uint16_t vertical_padding_px{2};
  std::uint16_t border_width_px{2};
  std::uint16_t border_radius_px{8};
};

struct Config {
  WidgetBlock block{};
  FontSpec font{};
  Placement placement{};
  ScaleStyle scale{};
};

// Creates the display-independent Delta Time presentation state's LVGL view.
// Returns false when the display or configured geometry is invalid.
[[nodiscard]] bool create(lv_display_t* display, const Config& config);

}  // namespace simcore::dashboard::delta_time_widget
