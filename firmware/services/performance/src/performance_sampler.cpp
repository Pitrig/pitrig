#include "performance.hpp"

#include "simcore_features.hpp"
#if SIMCORE_DEBUG
#include <algorithm>
#include <array>
#include <cstdint>

#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include "freertos/task.h"
#include "performance_internal.hpp"
#endif

// The sampler half of the service: the once-a-second task that drains the
// hooks' measurements into one PerformanceStats snapshot. The hooks themselves
// live in performance.cpp.
namespace simcore::performance {
#if SIMCORE_DEBUG

using namespace internal;

namespace {

constexpr std::uint32_t kUpdatePeriodMs = 1'000;
constexpr std::uint32_t kTaskStackDepth = 2'048;
constexpr UBaseType_t kTaskPriority = 1;
constexpr BaseType_t kTaskCore = 0;

std::int64_t last_update_us;
configRUN_TIME_COUNTER_TYPE last_runtime;
configRUN_TIME_COUNTER_TYPE last_idle_core0;
configRUN_TIME_COUNTER_TYPE last_idle_core1;
bool started;
StaticTask_t task_buffer;
StackType_t task_stack[kTaskStackDepth];

std::uint32_t stack_free_bytes(const TaskHandle_t task) {
  return task == nullptr
             ? 0
             : static_cast<std::uint32_t>(
                   uxTaskGetStackHighWaterMark(task) * sizeof(StackType_t));
}

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
  register_task(TaskMetric::sampler, task);
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
  std::array<TaskHandle_t, static_cast<std::size_t>(TaskMetric::count)>
      task_handles{};

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
  task_handles = monitored_tasks;
  taskEXIT_CRITICAL(&state_lock);

  PerformanceStats next{};
  if (elapsed_us > 0) {
    next.fps = static_cast<float>(interval.frames) * 1'000'000.0F /
               static_cast<float>(elapsed_us);
  }
  next.cpu_core0 = cpu_usage(idle_core0_delta, runtime_delta);
  next.cpu_core1 = cpu_usage(idle_core1_delta, runtime_delta);
  next.render_time_us = average(interval.render_time_us, interval.render_samples);
  next.flush_time_us = average(interval.flush_time_us, interval.render_samples);
  next.sync_time_us = average(interval.sync_time_us, interval.render_samples);
  next.longest_frame_us = interval.longest_frame_us;
  next.longest_work_us = interval.longest_work_us;
  next.longest_gap_us = interval.longest_gap_us;
  constexpr std::uint32_t kInternalHeapCapabilities = MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL;
  next.free_heap = heap_caps_get_free_size(kInternalHeapCapabilities);
  next.largest_heap_block =
      heap_caps_get_largest_free_block(kInternalHeapCapabilities);
  next.free_psram = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
  next.uptime_ms = static_cast<std::uint64_t>(now_us / 1'000);
  next.task_stacks = {
      .lvgl_free_bytes =
          stack_free_bytes(task_handles[static_cast<std::size_t>(TaskMetric::lvgl)]),
      .transport_free_bytes = stack_free_bytes(
          task_handles[static_cast<std::size_t>(TaskMetric::transport)]),
      .configuration_free_bytes =
          stack_free_bytes(task_handles[static_cast<std::size_t>(
              TaskMetric::configuration_control)]),
      // Only one upload can own the serial link at a time, so the three share
      // one line: whichever tasks are idle report their full stack.
      .asset_upload_free_bytes = std::min(
          {stack_free_bytes(
               task_handles[static_cast<std::size_t>(TaskMetric::font_asset_control)]),
           stack_free_bytes(
               task_handles[static_cast<std::size_t>(TaskMetric::image_asset_control)]),
           stack_free_bytes(
               task_handles[static_cast<std::size_t>(TaskMetric::firmware_update)])}),
      .sampler_free_bytes = stack_free_bytes(
          task_handles[static_cast<std::size_t>(TaskMetric::sampler)]),
  };

  taskENTER_CRITICAL(&state_lock);
  stats = next;
  taskEXIT_CRITICAL(&state_lock);
}
#endif

}  // namespace simcore::performance
