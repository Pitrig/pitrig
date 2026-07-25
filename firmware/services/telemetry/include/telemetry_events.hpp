#pragma once

#include "event_bus.hpp"
#include "telemetry_types.hpp"

namespace simcore::telemetry {

inline constexpr events::EventId kTelemetryUpdatedEvent = 0x54454C45U;

struct TelemetryUpdated {
  Field changed_fields{Field::none};
  std::uint64_t revision{};
};

}  // namespace simcore::telemetry
