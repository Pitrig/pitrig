#include "telemetry_provider.hpp"

#include "telemetry_events.hpp"

namespace simcore::telemetry {

TelemetryProvider::TelemetryProvider(TelemetryStateService& state, events::EventBus& event_bus)
    : state_(state), event_bus_(event_bus) {}

void TelemetryProvider::submit(const TelemetryUpdate& update) {
  const CommitResult result = state_.apply(update);
  if (!result.changed()) {
    return;
  }

  const TelemetryUpdated payload{
      .handle = result.handle,
      .revision = result.revision,
  };
  event_bus_.publish({
      .id = kTelemetryUpdatedEvent,
      .payload = &payload,
      .payload_size = sizeof(payload),
  });
}

}  // namespace simcore::telemetry
