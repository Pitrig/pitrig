#include "mock_telemetry.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>

#include "esp_check.h"
#include "esp_timer.h"
#include "lap_timer.hpp"

namespace simcore::mock_telemetry {
namespace {

constexpr std::array<std::uint64_t, 5> kIntervalsUs{83'000, 117'000, 96'000, 141'000, 74'000};
constexpr std::array<std::int32_t, 5> kTimingErrorsMs{-7, 4, -3, 8, -5};

esp_timer_handle_t telemetry_timer;
std::int64_t start_time_us;
std::size_t update_index;

void schedule_next_update() {
  ESP_ERROR_CHECK(esp_timer_start_once(telemetry_timer, kIntervalsUs[update_index]));
}

void publish_update(void*) {
  constexpr std::int64_t kMicrosecondsPerMillisecond = 1'000;

  const std::int64_t elapsed_ms =
      (esp_timer_get_time() - start_time_us) / kMicrosecondsPerMillisecond;
  const std::int64_t telemetry_ms =
      elapsed_ms + static_cast<std::int64_t>(kTimingErrorsMs[update_index]);
  const auto sample = static_cast<std::uint32_t>(
      telemetry_ms > 0
          ? std::min<std::int64_t>(telemetry_ms, std::numeric_limits<std::uint32_t>::max())
          : 0);

  lap_timer::update(sample);
  update_index = (update_index + 1) % kIntervalsUs.size();
  schedule_next_update();
}

}  // namespace

void start() {
  lap_timer::update(0);
  start_time_us = esp_timer_get_time();

  const esp_timer_create_args_t timer_args{
      .callback = publish_update,
      .arg = nullptr,
      .dispatch_method = ESP_TIMER_TASK,
      .name = "mock_telemetry",
      .skip_unhandled_events = true,
  };
  ESP_ERROR_CHECK(esp_timer_create(&timer_args, &telemetry_timer));
  schedule_next_update();
}

}  // namespace simcore::mock_telemetry
