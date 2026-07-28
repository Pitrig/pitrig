#pragma once

#include <cstdint>

#include "dashboard_layout.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::dashboard::fuel_widget {

struct LevelConfig {
  bool enabled{};
  FontSpec font{.family = FontFamily::montserrat, .size_px = 24};
  Placement placement{
      .region_id = kScreenRegionId,
      .anchor = Anchor::bottom_left,
      .offset_x = 16,
      .offset_y = -24,
      .width = 126,
      .height = 64,
  };
  std::uint32_t text_color_rgb{0xE8E8E8};
};

struct StatisticConfig {
  bool enabled{};
  FontSpec font{.family = FontFamily::montserrat, .size_px = 24};
  Placement placement{
      .region_id = kScreenRegionId,
      .anchor = Anchor::bottom_right,
      .offset_x = -16,
      .offset_y = -24,
      .width = 126,
      .height = 30,
  };
  std::uint32_t text_color_rgb{0xE8E8E8};
};

enum class Statistic : std::uint8_t {
  average_consumption,
  laps_remaining,
};

// Creates the whole-liter fuel value.
[[nodiscard]] bool create_level(
    const Layout& layout, const LevelConfig& config,
    const telemetry::ITelemetryReader& telemetry);

// Creates one periodically refreshed fuel statistic label.
[[nodiscard]] bool create_statistic(
    const Layout& layout, const StatisticConfig& config, Statistic statistic,
    const telemetry::ITelemetryReader& telemetry);

}  // namespace simcore::dashboard::fuel_widget
