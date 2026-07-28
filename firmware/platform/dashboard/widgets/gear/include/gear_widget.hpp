#pragma once

#include <cstdint>

#include "dashboard_layout.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::dashboard::gear_widget {

struct Border {
  std::uint32_t color_rgb{0xAEAEAE};
  std::uint16_t width_px{2};
  std::uint16_t radius_px{12};
};

struct Config {
  bool enabled{};
  FontSpec font{.family = FontFamily::montserrat, .size_px = 48};
  Placement placement{
      .region_id = kScreenRegionId,
      .anchor = Anchor::top_center,
      .offset_x = 0,
      .offset_y = 16,
      .width = 120,
      .height = 120,
  };
  Insets padding{.left = 8, .top = 8, .right = 8, .bottom = 8};
  Border border{};
  std::uint32_t text_color_rgb{0xE8E8E8};
  std::uint32_t background_color_rgb{0x0B0B0B};
};

// Creates a periodically refreshed LVGL view of the latest telemetry gear.
[[nodiscard]] bool create(const Layout& layout, const Config& config,
                          const telemetry::ITelemetryReader& telemetry);

}  // namespace simcore::dashboard::gear_widget
