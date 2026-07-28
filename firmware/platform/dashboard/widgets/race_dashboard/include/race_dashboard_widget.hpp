#pragma once

#include <cstdint>

#include "dashboard_layout.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::dashboard::race_dashboard_widget {

enum class LayoutVariant : std::uint8_t { compact, wide };

struct Config {
  bool enabled{};
  LayoutVariant variant{LayoutVariant::compact};
  Placement placement{
      .region_id = kScreenRegionId,
      .anchor = Anchor::center,
      .width = 480,
      .height = 480,
  };
};

// Creates a complete, responsive racing dashboard page. The page owns only
// presentation state; all displayed values come from the canonical telemetry
// snapshot.
[[nodiscard]] bool create(const Layout& layout, const Config& config,
                          const telemetry::ITelemetryReader& telemetry);

}  // namespace simcore::dashboard::race_dashboard_widget
