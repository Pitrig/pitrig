#pragma once

#include <cstdint>

namespace simcore::events {
class EventBus;
}

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::lap_timer {

struct Config {
  // Display only the last received telemetry value without local extrapolation.
  bool telemetry_only{false};
  // Stop local extrapolation when current-lap telemetry is stale for this long.
  std::uint32_t telemetry_timeout_ms{1'000};
};

// Subscribes the module to telemetry notifications.
bool start(events::EventBus& event_bus,
           const telemetry::ITelemetryReader& telemetry_reader,
           const Config& config);

// Returns the latest telemetry value or locally extrapolated time, according to
// configuration.
[[nodiscard]] std::uint32_t current_time();

}  // namespace simcore::lap_timer
