#include "lap_timer.hpp"

#include <algorithm>
#include <limits>

#include "esp_timer.h"
#include "freertos/FreeRTOS.h"

namespace simcore::lap_timer {
namespace {

constexpr std::int64_t kMicrosecondsPerMillisecond = 1'000;
constexpr std::int64_t kImmediateCorrectionThresholdUs = 250'000;
constexpr std::int64_t kCorrectionRateDivisor = 4;

struct State {
  std::int64_t current_time_us{};
  std::int64_t pending_correction_us{};
  std::int64_t last_clock_us{};
  std::uint32_t last_telemetry_ms{};
  bool initialized{};
};

State state;
portMUX_TYPE state_lock = portMUX_INITIALIZER_UNLOCKED;

void advance_to(const std::int64_t now_us) {
  if (!state.initialized) {
    return;
  }

  const std::int64_t effective_now_us = std::max(now_us, state.last_clock_us);
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
  state.last_telemetry_ms = lap_time_ms;
  state.initialized = true;
}

}  // namespace

void update(const std::uint32_t lap_time_ms) {
  const std::int64_t now_us = esp_timer_get_time();

  portENTER_CRITICAL(&state_lock);
  if (!state.initialized) {
    synchronize(lap_time_ms, now_us);
    portEXIT_CRITICAL(&state_lock);
    return;
  }

  advance_to(now_us);

  const std::int64_t received_time_us =
      static_cast<std::int64_t>(lap_time_ms) * kMicrosecondsPerMillisecond;
  const std::int64_t error_us = received_time_us - state.current_time_us;
  const bool lap_restarted = lap_time_ms < state.last_telemetry_ms;
  const bool correction_is_large = error_us > kImmediateCorrectionThresholdUs ||
                                   error_us < -kImmediateCorrectionThresholdUs;
  state.last_telemetry_ms = lap_time_ms;

  if (lap_restarted || correction_is_large) {
    state.current_time_us = received_time_us;
    state.pending_correction_us = 0;
  } else {
    state.pending_correction_us = error_us;
  }
  portEXIT_CRITICAL(&state_lock);
}

std::uint32_t current_time() {
  const std::int64_t now_us = esp_timer_get_time();

  portENTER_CRITICAL(&state_lock);
  advance_to(now_us);
  const std::int64_t time_ms = state.current_time_us / kMicrosecondsPerMillisecond;
  const auto result = static_cast<std::uint32_t>(
      std::clamp<std::int64_t>(time_ms, 0, std::numeric_limits<std::uint32_t>::max()));
  portEXIT_CRITICAL(&state_lock);

  return result;
}

}  // namespace simcore::lap_timer
