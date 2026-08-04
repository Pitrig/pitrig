#include "performance.hpp"

#include "simcore_features.hpp"
#if SIMCORE_DEBUG
#include <algorithm>
#include <cinttypes>
#include <cstdint>
#include <cstdio>

#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include "freertos/task.h"
#include "logger.hpp"
#endif

namespace simcore::performance {
#if SIMCORE_DEBUG
namespace {

constexpr char kTag[] = "performance";
constexpr std::uint32_t kUpdatePeriodMs = 1'000;
constexpr std::uint32_t kTaskStackDepth = 2'048;
constexpr UBaseType_t kTaskPriority = 1;
constexpr BaseType_t kTaskCore = 0;

struct Measurements {
  std::uint32_t frames;
  std::uint64_t render_time_us;
  std::uint32_t render_samples;
  std::uint64_t flush_time_us;
  std::uint32_t flush_samples;
};

portMUX_TYPE state_lock = portMUX_INITIALIZER_UNLOCKED;
PerformanceStats stats{};
Measurements measurements{};
std::int64_t render_started_at_us;
std::int64_t flush_started_at_us;
std::int64_t last_update_us;
configRUN_TIME_COUNTER_TYPE last_runtime;
configRUN_TIME_COUNTER_TYPE last_idle_core0;
configRUN_TIME_COUNTER_TYPE last_idle_core1;
bool started;
bool frame_in_progress;
StaticTask_t task_buffer;
StackType_t task_stack[kTaskStackDepth];

std::uint32_t average(std::uint64_t total, std::uint32_t count) {
  if (count == 0) {
    return 0;
  }
  return static_cast<std::uint32_t>(total / count);
}

float cpu_usage(configRUN_TIME_COUNTER_TYPE idle_delta,
                configRUN_TIME_COUNTER_TYPE runtime_delta) {
  if (runtime_delta == 0) {
    return 0.0F;
  }

  const float idle_percent =
      static_cast<float>(idle_delta) * 100.0F / static_cast<float>(runtime_delta);
  return std::clamp(100.0F - idle_percent, 0.0F, 100.0F);
}

#ifdef SIMCORE_PERFORMANCE_SERIAL
void print_stats(const PerformanceStats& snapshot) {
  char output[320];
  std::snprintf(output, sizeof(output),
                "\n================================\n"
                "FPS        : %.1f\n"
                "CPU0       : %.1f%%\n"
                "CPU1       : %.1f%%\n"
                "Render     : %" PRIu32 " us\n"
                "Flush      : %" PRIu32 " us\n"
                "Heap       : %" PRIu32 " KB\n"
                "Largest    : %" PRIu32 " KB\n"
                "PSRAM      : %" PRIu32 " KB\n"
                "================================",
                static_cast<double>(snapshot.fps), static_cast<double>(snapshot.cpu_core0),
                static_cast<double>(snapshot.cpu_core1), snapshot.render_time_us,
                snapshot.flush_time_us, snapshot.free_heap / 1'024,
                snapshot.largest_heap_block / 1'024, snapshot.free_psram / 1'024);
  log::info(kTag, output);
}
#endif

void sampler_task(void*) {
  TickType_t last_wake_time = xTaskGetTickCount();
  while (true) {
    vTaskDelayUntil(&last_wake_time, pdMS_TO_TICKS(kUpdatePeriodMs));
    update();
  }
}

}  // namespace

void begin() {
  taskENTER_CRITICAL(&state_lock);
  if (started) {
    taskEXIT_CRITICAL(&state_lock);
    return;
  }

  started = true;
  taskEXIT_CRITICAL(&state_lock);

  last_update_us = esp_timer_get_time();
  last_runtime = portGET_RUN_TIME_COUNTER_VALUE();
  last_idle_core0 = ulTaskGetIdleRunTimeCounterForCore(0);
  last_idle_core1 = ulTaskGetIdleRunTimeCounterForCore(1);

  const TaskHandle_t task =
      xTaskCreateStaticPinnedToCore(sampler_task, "performance", kTaskStackDepth,
                                    nullptr, kTaskPriority, task_stack, &task_buffer,
                                    kTaskCore);
  configASSERT(task != nullptr);
}

void frame_started() {
  taskENTER_CRITICAL(&state_lock);
  frame_in_progress = true;
  taskEXIT_CRITICAL(&state_lock);
}

void frame_finished() {
  taskENTER_CRITICAL(&state_lock);
  if (frame_in_progress) {
    ++measurements.frames;
    frame_in_progress = false;
  }
  taskEXIT_CRITICAL(&state_lock);
}

void render_started() {
  const std::int64_t now_us = esp_timer_get_time();
  taskENTER_CRITICAL(&state_lock);
  render_started_at_us = now_us;
  taskEXIT_CRITICAL(&state_lock);
}

void render_finished() {
  const std::int64_t now_us = esp_timer_get_time();
  taskENTER_CRITICAL(&state_lock);
  if (render_started_at_us != 0) {
    measurements.render_time_us +=
        static_cast<std::uint64_t>(now_us - render_started_at_us);
    ++measurements.render_samples;
    render_started_at_us = 0;
  }
  taskEXIT_CRITICAL(&state_lock);
}

void flush_started() {
  const std::int64_t now_us = esp_timer_get_time();
  taskENTER_CRITICAL(&state_lock);
  flush_started_at_us = now_us;
  taskEXIT_CRITICAL(&state_lock);
}

void flush_finished() {
  const std::int64_t now_us = esp_timer_get_time();
  taskENTER_CRITICAL(&state_lock);
  if (flush_started_at_us != 0) {
    measurements.flush_time_us += static_cast<std::uint64_t>(now_us - flush_started_at_us);
    ++measurements.flush_samples;
    flush_started_at_us = 0;
  }
  taskEXIT_CRITICAL(&state_lock);
}

void update() {
  const std::int64_t now_us = esp_timer_get_time();
  const configRUN_TIME_COUNTER_TYPE runtime = portGET_RUN_TIME_COUNTER_VALUE();
  const configRUN_TIME_COUNTER_TYPE idle_core0 = ulTaskGetIdleRunTimeCounterForCore(0);
  const configRUN_TIME_COUNTER_TYPE idle_core1 = ulTaskGetIdleRunTimeCounterForCore(1);

  Measurements interval{};
  std::int64_t elapsed_us = 0;
  configRUN_TIME_COUNTER_TYPE runtime_delta = 0;
  configRUN_TIME_COUNTER_TYPE idle_core0_delta = 0;
  configRUN_TIME_COUNTER_TYPE idle_core1_delta = 0;

  taskENTER_CRITICAL(&state_lock);
  interval = measurements;
  measurements = {};
  elapsed_us = now_us - last_update_us;
  runtime_delta = runtime - last_runtime;
  idle_core0_delta = idle_core0 - last_idle_core0;
  idle_core1_delta = idle_core1 - last_idle_core1;
  last_update_us = now_us;
  last_runtime = runtime;
  last_idle_core0 = idle_core0;
  last_idle_core1 = idle_core1;
  taskEXIT_CRITICAL(&state_lock);

  PerformanceStats next{};
  if (elapsed_us > 0) {
    next.fps = static_cast<float>(interval.frames) * 1'000'000.0F /
               static_cast<float>(elapsed_us);
  }
  next.cpu_core0 = cpu_usage(idle_core0_delta, runtime_delta);
  next.cpu_core1 = cpu_usage(idle_core1_delta, runtime_delta);
  next.render_time_us = average(interval.render_time_us, interval.render_samples);
  next.flush_time_us = average(interval.flush_time_us, interval.flush_samples);
  constexpr std::uint32_t kInternalHeapCapabilities = MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL;
  next.free_heap = heap_caps_get_free_size(kInternalHeapCapabilities);
  next.largest_heap_block =
      heap_caps_get_largest_free_block(kInternalHeapCapabilities);
  next.free_psram = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
  next.uptime_ms = static_cast<std::uint64_t>(now_us / 1'000);

  taskENTER_CRITICAL(&state_lock);
  stats = next;
  taskEXIT_CRITICAL(&state_lock);

#ifdef SIMCORE_PERFORMANCE_SERIAL
  print_stats(next);
#endif
}

PerformanceStats get_stats() {
  taskENTER_CRITICAL(&state_lock);
  const PerformanceStats snapshot = stats;
  taskEXIT_CRITICAL(&state_lock);
  return snapshot;
}
#endif

}  // namespace simcore::performance
