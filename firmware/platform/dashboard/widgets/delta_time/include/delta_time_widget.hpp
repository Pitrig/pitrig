#pragma once

#include "dashboard_layout.hpp"

namespace simcore::dashboard::delta_time_widget {

struct ScaleStyle {
  std::uint16_t vertical_padding_px{2};
  std::uint16_t border_width_px{2};
  std::uint16_t border_radius_px{8};
};

struct Config {
  FontSpec font{};
  Placement placement{};
  ScaleStyle scale{};
};

// Creates the display-independent Delta Time presentation state's LVGL view.
// Returns false when the display or configured geometry is invalid.
[[nodiscard]] bool create(const Layout& layout, const Config& config);

}  // namespace simcore::dashboard::delta_time_widget
