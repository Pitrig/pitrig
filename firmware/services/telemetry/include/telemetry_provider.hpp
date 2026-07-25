#pragma once

#include "event_bus.hpp"
#include "telemetry_state.hpp"

namespace simcore::telemetry {

// Commits decoded telemetry updates and notifies subscribers after state changes.
class TelemetryProvider {
 public:
  TelemetryProvider(TelemetryStateService& state, events::EventBus& event_bus);

  void submit(const TelemetryUpdate& update);

 private:
  TelemetryStateService& state_;
  events::EventBus& event_bus_;
};

}  // namespace simcore::telemetry
