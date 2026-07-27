#pragma once

#include "dashboard_layout.hpp"

namespace simcore::estimated_lap_time {
class EstimatedLapTime;
}

namespace simcore::dashboard::estimated_lap_time_widget {

struct Config {
  FontSpec font{};
  Placement placement{};
  std::uint32_t text_color_rgb{0xE8E8E8};
};

// Creates the LVGL view for Estimated Lap Time presentation state.
[[nodiscard]] bool create(
    const Layout& layout, const Config& config,
    const estimated_lap_time::EstimatedLapTime& module);

}  // namespace simcore::dashboard::estimated_lap_time_widget
