#pragma once

#include <cstdint>

namespace simcore::events {
class EventBus;
}

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::lap_timer {

// Subscribes the module to telemetry notifications.
bool start(events::EventBus& event_bus, const telemetry::ITelemetryReader& telemetry_reader);

// Returns the locally extrapolated current lap time.
[[nodiscard]] std::uint32_t current_time();

}  // namespace simcore::lap_timer
