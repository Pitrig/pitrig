#include "estimated_lap_time.hpp"

#include <cstdio>
#include <mutex>

#include "event_bus.hpp"
#include "telemetry_events.hpp"
#include "telemetry_state.hpp"

namespace simcore::estimated_lap_time {
namespace {

Config module_config;
PresentationState presentation_state;
std::mutex state_mutex;
const telemetry::ITelemetryReader* telemetry_reader;
events::Subscription telemetry_subscription;

void set_unavailable() {
  const std::lock_guard lock(state_mutex);
  presentation_state.text = module_config.placeholder;
  presentation_state.text.back() = '\0';
  presentation_state.color_rgb = module_config.text_color_rgb;
  presentation_state.visible =
      module_config.unavailable_behavior == UnavailableBehavior::placeholder;
}

void set_time(const std::uint32_t milliseconds) {
  constexpr std::uint32_t kMillisecondsPerSecond = 1'000;
  constexpr std::uint32_t kSecondsPerMinute = 60;

  const std::uint32_t total_seconds = milliseconds / kMillisecondsPerSecond;
  const std::uint32_t minutes = total_seconds / kSecondsPerMinute % 100;
  const std::uint32_t seconds = total_seconds % kSecondsPerMinute;
  const std::uint32_t remaining_milliseconds =
      milliseconds % kMillisecondsPerSecond;

  PresentationState next{};
  std::snprintf(next.text.data(), next.text.size(), "%02lu:%02lu.%03lu",
                static_cast<unsigned long>(minutes),
                static_cast<unsigned long>(seconds),
                static_cast<unsigned long>(remaining_milliseconds));
  next.color_rgb = module_config.text_color_rgb;
  next.visible = true;

  const std::lock_guard lock(state_mutex);
  presentation_state = next;
}

void on_telemetry_updated(const events::Event& event, void*) {
  if (event.payload == nullptr ||
      event.payload_size != sizeof(telemetry::TelemetryUpdated) ||
      telemetry_reader == nullptr) {
    return;
  }

  const auto& update =
      *static_cast<const telemetry::TelemetryUpdated*>(event.payload);
  if (!telemetry::contains(update.changed_fields,
                           telemetry::Field::lap_time_estimated)) {
    return;
  }

  const telemetry::TelemetrySnapshot snapshot = telemetry_reader->snapshot();
  if (!telemetry::contains(snapshot.valid_fields,
                           telemetry::Field::lap_time_estimated)) {
    set_unavailable();
    return;
  }

  set_time(snapshot.values.lap_time_estimated_ms);
}

}  // namespace

bool start(events::EventBus& event_bus,
           const telemetry::ITelemetryReader& reader,
           const Config& config) {
  module_config = config;
  module_config.placeholder.back() = '\0';
  telemetry_reader = &reader;
  set_unavailable();

  telemetry_subscription =
      event_bus.subscribe(telemetry::kTelemetryUpdatedEvent,
                          &on_telemetry_updated, nullptr);
  return telemetry_subscription.valid;
}

PresentationState presentation() {
  const std::lock_guard lock(state_mutex);
  return presentation_state;
}

}  // namespace simcore::estimated_lap_time
