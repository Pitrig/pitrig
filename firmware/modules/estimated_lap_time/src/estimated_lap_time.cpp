#include "estimated_lap_time.hpp"

#include <cstdio>
#include <mutex>

#include "event_bus.hpp"
#include "telemetry_events.hpp"
#include "telemetry_state.hpp"

namespace simcore::estimated_lap_time {

EstimatedLapTime::~EstimatedLapTime() {
  stop();
}

void EstimatedLapTime::set_unavailable() {
  const std::lock_guard lock(state_mutex_);
  presentation_state_.text = config_.placeholder;
  presentation_state_.text.back() = '\0';
  presentation_state_.visible =
      config_.unavailable_behavior == UnavailableBehavior::placeholder;
}

void EstimatedLapTime::set_time(const std::uint32_t milliseconds) {
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
  next.visible = true;

  const std::lock_guard lock(state_mutex_);
  presentation_state_ = next;
}

void EstimatedLapTime::on_telemetry_updated(const events::Event& event,
                                            void* const context) {
  auto& module = *static_cast<EstimatedLapTime*>(context);
  if (event.payload == nullptr ||
      event.payload_size != sizeof(telemetry::TelemetryUpdated) ||
      module.telemetry_reader_ == nullptr) {
    return;
  }

  const auto& update =
      *static_cast<const telemetry::TelemetryUpdated*>(event.payload);
  if (!telemetry::contains(update.changed_fields,
                           telemetry::Field::lap_time_estimated)) {
    return;
  }

  const telemetry::TelemetrySnapshot snapshot =
      module.telemetry_reader_->snapshot();
  if (!telemetry::contains(snapshot.valid_fields,
                           telemetry::Field::lap_time_estimated)) {
    module.set_unavailable();
    return;
  }

  module.set_time(snapshot.values.lap_time_estimated_ms);
}

bool EstimatedLapTime::start(events::EventBus& event_bus,
                             const telemetry::ITelemetryReader& reader,
                             const Config& config) {
  if (telemetry_subscription_.valid) {
    return false;
  }
  config_ = config;
  config_.placeholder.back() = '\0';
  telemetry_reader_ = &reader;
  event_bus_ = &event_bus;
  set_unavailable();

  telemetry_subscription_ = event_bus.subscribe(
      telemetry::kTelemetryUpdatedEvent,
      &EstimatedLapTime::on_telemetry_updated, this);
  if (!telemetry_subscription_.valid) {
    telemetry_reader_ = nullptr;
    event_bus_ = nullptr;
  }
  return telemetry_subscription_.valid;
}

void EstimatedLapTime::stop() {
  if (event_bus_ != nullptr && telemetry_subscription_.valid) {
    event_bus_->unsubscribe(telemetry_subscription_);
  }
  telemetry_subscription_ = {};
  telemetry_reader_ = nullptr;
  event_bus_ = nullptr;
}

PresentationState EstimatedLapTime::presentation() const {
  const std::lock_guard lock(state_mutex_);
  return presentation_state_;
}

}  // namespace simcore::estimated_lap_time
