#include <algorithm>

#include "esp_timer.h"
#include "graph_plot.hpp"
#include "graph_widget.hpp"
#include "lvgl.h"
#include "widget_conditions.hpp"

namespace simcore::dashboard::graph_widget {
namespace {

constexpr std::uint32_t kSampleTickDivisor = 4;
constexpr std::uint64_t kMinimumSampleTickUs = 2'000;

Collection* g_sampling_collection = nullptr;
esp_timer_handle_t g_sample_timer = nullptr;

}

void Collection::sample_timer(void*) {
  if (g_sampling_collection != nullptr) {
    g_sampling_collection->sample_all();
  }
}

void Collection::sample_state(State& state) {
  const std::uint32_t now = lv_tick_get();
  if (state.initialized &&
      now - state.last_sample_tick < state.sample_interval_ms) {
    return;
  }
  const std::uint32_t scheduled =
      state.initialized ? state.last_sample_tick + state.sample_interval_ms : now;
  const std::uint8_t write = state.pending_write.load(std::memory_order_relaxed);
  const auto next = static_cast<std::uint8_t>((write + 1) % kPendingSamples);
  if (next == state.pending_read.load(std::memory_order_acquire)) {
    return;
  }
  state.last_sample_tick =
      now - scheduled > 4U * state.sample_interval_ms ? now : scheduled;
  state.initialized = true;
  for (std::size_t index = 0; index < state.trace_count; ++index) {
    const Trace& trace = state.traces[index];
    if (trace.read == nullptr) {
      state.pending[write][index] = 0;
      continue;
    }
    const telemetry::TelemetryRead value = trace.read(trace.read_context);
    const std::optional<double> numeric = conditions::condition_value(value);
    const float fraction =
        numeric.has_value() ? conditions::range_fraction(*numeric, trace.range)
                            : 0.0F;
    const float y = static_cast<float>(state.line_inset) +
                    plot::sample_y(state.plot_height, fraction);
    state.pending[write][index] =
        static_cast<std::int16_t>(y * plot::kSubPixel + 0.5F);
  }
  state.pending_write.store(next, std::memory_order_release);
}

void Collection::sample_all() {
  if (!created_) {
    return;
  }
  for (std::size_t index = 0; index < count_; ++index) {
    State& state = states_[index];
    if (state.canvas == nullptr) {
      continue;
    }
    sample_state(state);
  }
}

void Collection::start_sampling() {
  std::uint32_t shortest = 0;
  for (std::size_t index = 0; index < count_; ++index) {
    const std::uint32_t interval = states_[index].sample_interval_ms;
    if (states_[index].canvas != nullptr && interval > 0 &&
        (shortest == 0 || interval < shortest)) {
      shortest = interval;
    }
  }
  if (shortest == 0) {
    return;
  }
  g_sampling_collection = this;
  if (g_sample_timer == nullptr) {
    const esp_timer_create_args_t timer_args{
        .callback = &Collection::sample_timer,
        .arg = nullptr,
        .dispatch_method = ESP_TIMER_TASK,
        .name = "graphSample",
        .skip_unhandled_events = true,
    };
    if (esp_timer_create(&timer_args, &g_sample_timer) != ESP_OK) {
      return;
    }
  }
  const std::uint64_t period = std::max<std::uint64_t>(
      kMinimumSampleTickUs,
      static_cast<std::uint64_t>(shortest) * 1000U / kSampleTickDivisor);
  (void)esp_timer_stop(g_sample_timer);
  (void)esp_timer_start_periodic(g_sample_timer, period);
}

void Collection::stop_sampling() {
  if (g_sample_timer != nullptr) {
    (void)esp_timer_stop(g_sample_timer);
  }
}

}
