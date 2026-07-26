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
constexpr std::int64_t kImmediateCorrectionThresholdUs = 250'000;
constexpr std::int64_t kCorrectionRateDivisor = 4;

struct State {
  std::int64_t current_time_us{};
  std::int64_t pending_correction_us{};
  std::int64_t last_clock_us{};
  std::int64_t last_telemetry_clock_us{};
  std::int64_t telemetry_timeout_us{};
  std::uint32_t last_telemetry_ms{};
  bool initialized{};
  bool telemetry_only{};
};

State state;
std::mutex state_mutex;
const telemetry::ITelemetryReader* telemetry_reader;
events::Subscription telemetry_subscription;

std::int64_t monotonic_time_us() {
  using Microseconds = std::chrono::microseconds;
  return std::chrono::duration_cast<Microseconds>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}

void advance_to(const std::int64_t now_us) {
  if (!state.initialized) {
    return;
  }

  const std::int64_t telemetry_deadline_us =
      state.last_telemetry_clock_us + state.telemetry_timeout_us;
  const std::int64_t effective_now_us =
      std::min(std::max(now_us, state.last_clock_us), telemetry_deadline_us);
  const std::int64_t elapsed_us = effective_now_us - state.last_clock_us;
  const std::int64_t maximum_correction_us = elapsed_us / kCorrectionRateDivisor;
  const std::int64_t applied_correction_us =
      std::clamp(state.pending_correction_us, -maximum_correction_us, maximum_correction_us);

  state.current_time_us += elapsed_us + applied_correction_us;
  state.pending_correction_us -= applied_correction_us;
  state.last_clock_us = effective_now_us;
}

void synchronize(const std::uint32_t lap_time_ms, const std::int64_t now_us) {
  state.current_time_us = static_cast<std::int64_t>(lap_time_ms) * kMicrosecondsPerMillisecond;
  state.pending_correction_us = 0;
  state.last_clock_us = now_us;
  state.last_telemetry_clock_us = now_us;
  state.last_telemetry_ms = lap_time_ms;
  state.initialized = true;
}

void update(const std::uint32_t lap_time_ms) {
  const std::lock_guard lock(state_mutex);
  if (state.telemetry_only) {
    state.current_time_us =
        static_cast<std::int64_t>(lap_time_ms) *
        kMicrosecondsPerMillisecond;
    state.pending_correction_us = 0;
    state.last_telemetry_ms = lap_time_ms;
    state.initialized = true;
    return;
  }

  const std::int64_t now_us = monotonic_time_us();
  if (!state.initialized) {
    synchronize(lap_time_ms, now_us);
    return;
  }

  const bool telemetry_was_stale =
      now_us >
      state.last_telemetry_clock_us + state.telemetry_timeout_us;
  advance_to(now_us);

  const std::int64_t received_time_us =
      static_cast<std::int64_t>(lap_time_ms) * kMicrosecondsPerMillisecond;
  const std::int64_t error_us = received_time_us - state.current_time_us;
  const bool lap_restarted = lap_time_ms < state.last_telemetry_ms;
  const bool correction_is_large = error_us > kImmediateCorrectionThresholdUs ||
                                   error_us < -kImmediateCorrectionThresholdUs;
  state.last_telemetry_ms = lap_time_ms;
  state.last_telemetry_clock_us = now_us;
  if (telemetry_was_stale) {
    state.last_clock_us = now_us;
  }

  if (lap_restarted || correction_is_large) {
    state.current_time_us = received_time_us;
    state.pending_correction_us = 0;
  } else {
    state.pending_correction_us = error_us;
  }
}

void on_telemetry_updated(const events::Event& event, void*) {
  if (event.payload == nullptr || event.payload_size != sizeof(telemetry::TelemetryUpdated) ||
      telemetry_reader == nullptr) {
    return;
  }

  const auto& update = *static_cast<const telemetry::TelemetryUpdated*>(event.payload);
  if (!telemetry::contains(update.changed_fields, telemetry::Field::lap_time_current)) {
    return;
  }

  const telemetry::TelemetrySnapshot snapshot = telemetry_reader->snapshot();
  if (telemetry::contains(snapshot.valid_fields, telemetry::Field::lap_time_current)) {
    lap_timer::update(snapshot.values.lap_time_current_ms);
  }
}

}  // namespace

bool start(events::EventBus& event_bus,
           const telemetry::ITelemetryReader& reader,
           const Config& config) {
  {
    const std::lock_guard lock(state_mutex);
    state = {};
    state.telemetry_only = config.telemetry_only;
    const std::uint32_t timeout_ms =
        config.telemetry_timeout_ms > 0 ? config.telemetry_timeout_ms : 1'000;
    state.telemetry_timeout_us =
        static_cast<std::int64_t>(timeout_ms) *
        kMicrosecondsPerMillisecond;
  }
  telemetry_reader = &reader;
  telemetry_subscription =
      event_bus.subscribe(telemetry::kTelemetryUpdatedEvent, &on_telemetry_updated, nullptr);
  return telemetry_subscription.valid;
}

std::uint32_t current_time() {
  const std::lock_guard lock(state_mutex);
  if (!state.telemetry_only) {
    advance_to(monotonic_time_us());
  }
  const std::int64_t time_ms = state.current_time_us / kMicrosecondsPerMillisecond;
  const auto result = static_cast<std::uint32_t>(
      std::clamp<std::int64_t>(time_ms, 0, std::numeric_limits<std::uint32_t>::max()));

  return result;
}

}  // namespace simcore::lap_timer
