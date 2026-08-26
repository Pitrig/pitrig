#pragma once

#include "event_bus.hpp"
#include "telemetry_state.hpp"

namespace simcore::telemetry {

class TelemetryProvider {
 public:
  TelemetryProvider(TelemetryStateService& state, events::EventBus& event_bus);

  void submit(const TelemetryUpdate& update);

 private:
  TelemetryStateService& state_;
  events::EventBus& event_bus_;
};

}
