#pragma once

#include "dashboard_layout.hpp"

namespace simcore::dashboard::estimated_lap_time_widget {

struct Config {
  FontSpec font{};
  Placement placement{};
};

// Creates the LVGL view for Estimated Lap Time presentation state.
[[nodiscard]] bool create(const Layout& layout, const Config& config);

}  // namespace simcore::dashboard::estimated_lap_time_widget
