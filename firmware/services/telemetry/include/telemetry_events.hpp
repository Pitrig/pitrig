#pragma once

#include "event_bus.hpp"
#include "telemetry_types.hpp"

namespace pitrig::telemetry {

inline constexpr events::EventId kTelemetryUpdatedEvent = 0x54454C45U;

struct TelemetryUpdated {
  Handle handle{};
  std::uint64_t revision{};
};

}
