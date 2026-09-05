#include <algorithm>
#include <array>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "graph_plot.hpp"
#include "graph_widget.hpp"
#include "lvgl.h"
#include "pitrig_features.hpp"
#include "value_conditions.hpp"

namespace pitrig::dashboard::graph_widget {
namespace {

constexpr std::uint32_t kSampleTickDivisor = 4;
constexpr std::uint32_t kMinimumSampleTickMs = 2;
constexpr std::size_t kSamplerStackSize = 3072;
constexpr UBaseType_t kSamplerPriority = 2;

Collection* g_sampling_collection = nullptr;
TaskHandle_t g_sampler_task = nullptr;
StaticTask_t g_sampler_state;
std::array<StackType_t, kSamplerStackSize / sizeof(StackType_t)> g_sampler_stack;
volatile std::uint32_t g_sampler_period_ms = 0;

}

void Collection::sample_task(void*) {
  TickType_t previous = xTaskGetTickCount();
  while (true) {
    const std::uint32_t period = g_sampler_period_ms;
    if (period == 0 || g_sampling_collection == nullptr) {
      vTaskDelay(pdMS_TO_TICKS(20));
      previous = xTaskGetTickCount();
      continue;
    }
    g_sampling_collection->sample_all();
    vTaskDelayUntil(&previous, pdMS_TO_TICKS(period));
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
    stop_sampling();
    return;
  }
  g_sampling_collection = this;
  g_sampler_period_ms =
      std::max<std::uint32_t>(kMinimumSampleTickMs, shortest / kSampleTickDivisor);
  if (g_sampler_task == nullptr) {
    g_sampler_task = xTaskCreateStaticPinnedToCore(
        &Collection::sample_task, "graphSample", g_sampler_stack.size(), nullptr,
        kSamplerPriority, g_sampler_stack.data(), &g_sampler_state,
        PITRIG_COMMUNICATION_CORE);
  }
}

void Collection::stop_sampling() {
  g_sampler_period_ms = 0;
}

}
