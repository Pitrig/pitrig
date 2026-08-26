#include "lap_timer.hpp"

#include <algorithm>
#include <chrono>
#include <limits>
#include <mutex>

#include "event_bus.hpp"
#include "telemetry_events.hpp"
#include "telemetry_state.hpp"

namespace simcore::lap_timer {
namespace {

constexpr std::int64_t kMicrosecondsPerMillisecond = 1'000;
constexpr std::int64_t kTelemetryTimeoutUs = 1'000'000;
constexpr std::int64_t kImmediateCorrectionThresholdUs = 250'000;
constexpr std::int64_t kCorrectionRateDivisor = 4;

std::int64_t monotonic_time_us() {
  using Microseconds = std::chrono::microseconds;
  return std::chrono::duration_cast<Microseconds>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}

}

LapTimer::~LapTimer() {
  stop();
}

void LapTimer::advance_to(const std::int64_t now_us) {
  if (!state_.initialized) {
    return;
  }

  const std::int64_t telemetry_deadline_us =
      state_.last_telemetry_clock_us + state_.telemetry_timeout_us;
  const std::int64_t effective_now_us =
      std::min(std::max(now_us, state_.last_clock_us), telemetry_deadline_us);
  const std::int64_t elapsed_us = effective_now_us - state_.last_clock_us;
  const std::int64_t maximum_correction_us = elapsed_us / kCorrectionRateDivisor;
  const std::int64_t applied_correction_us =
      std::clamp(state_.pending_correction_us, -maximum_correction_us,
                 maximum_correction_us);

  state_.current_time_us += elapsed_us + applied_correction_us;
  state_.pending_correction_us -= applied_correction_us;
  state_.last_clock_us = effective_now_us;
}

void LapTimer::synchronize(const std::uint32_t lap_time_ms,
                           const std::int64_t now_us) {
  state_.current_time_us =
      static_cast<std::int64_t>(lap_time_ms) * kMicrosecondsPerMillisecond;
  state_.pending_correction_us = 0;
  state_.last_clock_us = now_us;
  state_.last_telemetry_clock_us = now_us;
  state_.last_telemetry_ms = lap_time_ms;
  state_.initialized = true;
}

void LapTimer::update(const std::uint32_t lap_time_ms) {
  const std::lock_guard lock(state_mutex_);
  const std::int64_t now_us = monotonic_time_us();
  if (!state_.initialized) {
    synchronize(lap_time_ms, now_us);
    return;
  }

  const bool telemetry_was_stale =
      now_us >
      state_.last_telemetry_clock_us + state_.telemetry_timeout_us;
  advance_to(now_us);

  const std::int64_t received_time_us =
      static_cast<std::int64_t>(lap_time_ms) * kMicrosecondsPerMillisecond;
  const std::int64_t error_us = received_time_us - state_.current_time_us;
  const bool lap_restarted = lap_time_ms < state_.last_telemetry_ms;
  const bool correction_is_large = error_us > kImmediateCorrectionThresholdUs ||
                                   error_us < -kImmediateCorrectionThresholdUs;
  state_.last_telemetry_ms = lap_time_ms;
  state_.last_telemetry_clock_us = now_us;
  if (telemetry_was_stale) {
    state_.last_clock_us = now_us;
  }

  if (lap_restarted || correction_is_large) {
    state_.current_time_us = received_time_us;
    state_.pending_correction_us = 0;
  } else {
    state_.pending_correction_us = error_us;
  }
}

void LapTimer::on_telemetry_updated(const events::Event& event,
                                    void* const context) {
  auto& module = *static_cast<LapTimer*>(context);
  if (event.payload == nullptr ||
      event.payload_size != sizeof(telemetry::TelemetryUpdated) ||
      module.telemetry_reader_ == nullptr) {
    return;
  }

  const auto& update =
      *static_cast<const telemetry::TelemetryUpdated*>(event.payload);
  if (update.handle != module.telemetry_handle_) {
    return;
  }

  const telemetry::TelemetryRead value =
      module.telemetry_reader_->read(module.telemetry_handle_);
  if (value.available) {
    module.update(value.value.typed.uint32_value);
  }
}

bool LapTimer::start(events::EventBus& event_bus,
                     const telemetry::ITelemetryReader& reader,
                     const telemetry::Handle telemetry_handle) {
  if (telemetry_subscription_.valid || !telemetry_handle.valid() ||
      telemetry_handle.type != telemetry::ValueType::uint32) {
    return false;
  }
  {
    const std::lock_guard lock(state_mutex_);
    state_ = {};
    state_.telemetry_timeout_us = kTelemetryTimeoutUs;
  }
  telemetry_reader_ = &reader;
  telemetry_handle_ = telemetry_handle;
  event_bus_ = &event_bus;
  telemetry_subscription_ = event_bus.subscribe(
      telemetry::kTelemetryUpdatedEvent, &LapTimer::on_telemetry_updated, this);
  if (!telemetry_subscription_.valid) {
    telemetry_reader_ = nullptr;
    telemetry_handle_ = {};
    event_bus_ = nullptr;
  }
  return telemetry_subscription_.valid;
}

void LapTimer::stop() {
  if (event_bus_ != nullptr && telemetry_subscription_.valid) {
    event_bus_->unsubscribe(telemetry_subscription_);
  }
  telemetry_subscription_ = {};
  telemetry_reader_ = nullptr;
  telemetry_handle_ = {};
  event_bus_ = nullptr;
}

LapTimer::Snapshot LapTimer::snapshot() {
  const std::lock_guard lock(state_mutex_);
  if (!state_.initialized) {
    return {};
  }
  advance_to(monotonic_time_us());
  const std::int64_t time_ms =
      state_.current_time_us / kMicrosecondsPerMillisecond;
  const auto result = static_cast<std::uint32_t>(
      std::clamp<std::int64_t>(time_ms, 0, std::numeric_limits<std::uint32_t>::max()));

  return {.time_ms = result, .available = true};
}

}
