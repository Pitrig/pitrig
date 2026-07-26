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
  std::uint32_t faster_color_rgb{0x00C853};
  std::uint32_t slower_color_rgb{0xD50000};
  std::uint32_t neutral_color_rgb{0xE8E8E8};
  ScaleStyle scale{};
};

// Creates the display-independent Delta Time presentation state's LVGL view.
// Returns false when the display or configured geometry is invalid.
[[nodiscard]] bool create(const Layout& layout, const Config& config);

}  // namespace simcore::dashboard::delta_time_widget
