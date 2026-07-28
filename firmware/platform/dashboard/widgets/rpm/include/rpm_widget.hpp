#pragma once

#include <cstdint>

#include "dashboard_layout.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::dashboard::rpm_widget {

struct Config {
  bool enabled{};
  FontSpec font{.family = FontFamily::montserrat, .size_px = 48};
  Placement placement{
      .region_id = kScreenRegionId,
      .anchor = Anchor::bottom_center,
      .offset_x = 0,
      .offset_y = -96,
      .width = 320,
      .height = 64,
  };
  std::uint32_t text_color_rgb{0xE8E8E8};
};

// Creates a periodically refreshed numeric RPM label.
[[nodiscard]] bool create(const Layout& layout, const Config& config,
                          const telemetry::ITelemetryReader& telemetry);

}  // namespace simcore::dashboard::rpm_widget
