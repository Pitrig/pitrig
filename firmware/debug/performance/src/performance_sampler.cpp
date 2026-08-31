#include "performance.hpp"

#include <algorithm>
#include <array>
#include <cstdint>

#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include "freertos/task.h"
#include "performance_internal.hpp"

namespace simcore::performance {

using namespace internal;

namespace {

constexpr std::uint32_t kSamplePeriodMs = 50;
constexpr std::size_t kWindowSamples = 20;
constexpr std::size_t kHeapRefreshSamples = 20;
constexpr std::size_t kFragmentationRefreshSamples = 100;
constexpr std::uint32_t kTaskStackDepth = 2'048;
constexpr UBaseType_t kTaskPriority = 1;
constexpr BaseType_t kTaskCore = 0;

struct Sample {
  Measurements measurements;
  std::uint32_t elapsed_us;
  configRUN_TIME_COUNTER_TYPE runtime;
  configRUN_TIME_COUNTER_TYPE idle_core0;
  configRUN_TIME_COUNTER_TYPE idle_core1;
};

std::int64_t last_sample_us;
configRUN_TIME_COUNTER_TYPE last_runtime;
configRUN_TIME_COUNTER_TYPE last_idle_core0;
configRUN_TIME_COUNTER_TYPE last_idle_core1;
bool started;
StaticTask_t task_buffer;
StackType_t task_stack[kTaskStackDepth];

std::array<Sample, kWindowSamples> window;
std::size_t oldest_sample;
std::size_t heap_refresh_countdown;
std::size_t fragmentation_refresh_countdown;
PerformanceStats last_published;

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

void accumulate(Measurements& total, const Measurements& sample) {
  total.frames += sample.frames;
  total.render_time_us += sample.render_time_us;
  total.render_samples += sample.render_samples;
  total.flush_time_us += sample.flush_time_us;
  total.sync_time_us += sample.sync_time_us;
  total.invalidated_px += sample.invalidated_px;
  total.invalidated_areas += sample.invalidated_areas;
  total.drawn_areas += sample.drawn_areas;
  total.value_latency_total_us += sample.value_latency_total_us;
  total.value_latency_samples += sample.value_latency_samples;
  total.longest_frame_us =
      std::max(total.longest_frame_us, sample.longest_frame_us);
  total.longest_work_us =
      std::max(total.longest_work_us, sample.longest_work_us);
  total.longest_gap_us = std::max(total.longest_gap_us, sample.longest_gap_us);
  total.value_latency_max_us =
      std::max(total.value_latency_max_us, sample.value_latency_max_us);
}

void collect(Sample& into) {
  const std::int64_t now_us = esp_timer_get_time();
  const configRUN_TIME_COUNTER_TYPE runtime = portGET_RUN_TIME_COUNTER_VALUE();
  const configRUN_TIME_COUNTER_TYPE idle_core0 = ulTaskGetIdleRunTimeCounterForCore(0);
  const configRUN_TIME_COUNTER_TYPE idle_core1 = ulTaskGetIdleRunTimeCounterForCore(1);

  taskENTER_CRITICAL(&state_lock);
  into.measurements = measurements;
  measurements = {};
  taskEXIT_CRITICAL(&state_lock);

  into.elapsed_us = static_cast<std::uint32_t>(now_us - last_sample_us);
  into.runtime = runtime - last_runtime;
  into.idle_core0 = idle_core0 - last_idle_core0;
  into.idle_core1 = idle_core1 - last_idle_core1;
  last_sample_us = now_us;
  last_runtime = runtime;
  last_idle_core0 = idle_core0;
  last_idle_core1 = idle_core1;
}

[[nodiscard]] Sample window_total() {
  Sample total{};
  for (const Sample& sample : window) {
    accumulate(total.measurements, sample.measurements);
    total.elapsed_us += sample.elapsed_us;
    total.runtime += sample.runtime;
    total.idle_core0 += sample.idle_core0;
    total.idle_core1 += sample.idle_core1;
  }
  return total;
}

void refresh_heap_and_stacks(PerformanceStats& into) {
  std::array<TaskHandle_t, static_cast<std::size_t>(TaskMetric::count)>
      task_handles{};
  taskENTER_CRITICAL(&state_lock);
  task_handles = monitored_tasks;
  taskEXIT_CRITICAL(&state_lock);

  constexpr std::uint32_t kInternalHeapCapabilities = MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL;
  into.free_heap = heap_caps_get_free_size(kInternalHeapCapabilities);
  into.free_psram = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
  into.task_stacks = {
      .lvgl_free_bytes =
          stack_free_bytes(task_handles[static_cast<std::size_t>(TaskMetric::lvgl)]),
      .transport_free_bytes = stack_free_bytes(
          task_handles[static_cast<std::size_t>(TaskMetric::transport)]),
      .configuration_free_bytes =
          stack_free_bytes(task_handles[static_cast<std::size_t>(
              TaskMetric::configuration_control)]),
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
}

void refresh_fragmentation(PerformanceStats& into) {
  constexpr std::uint32_t kInternalHeapCapabilities = MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL;
  into.largest_heap_block =
      heap_caps_get_largest_free_block(kInternalHeapCapabilities);
  into.largest_psram_block = heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM);
}

void sampler_task(void*) {
  TickType_t last_wake_time = xTaskGetTickCount();
  while (true) {
    vTaskDelayUntil(&last_wake_time, pdMS_TO_TICKS(kSamplePeriodMs));
    update();
  }
}

}

void begin() {
  taskENTER_CRITICAL(&state_lock);
  if (started) {
    taskEXIT_CRITICAL(&state_lock);
    return;
  }

  started = true;
  taskEXIT_CRITICAL(&state_lock);

  last_sample_us = esp_timer_get_time();
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
  collect(window[oldest_sample]);
  oldest_sample = (oldest_sample + 1U) % kWindowSamples;

  const Sample total = window_total();
  PerformanceStats next = last_published;
  next.fps = total.elapsed_us > 0
                 ? static_cast<float>(total.measurements.frames) * 1'000'000.0F /
                       static_cast<float>(total.elapsed_us)
                 : 0.0F;
  next.cpu_core0 = cpu_usage(total.idle_core0, total.runtime);
  next.cpu_core1 = cpu_usage(total.idle_core1, total.runtime);
  next.render_time_us =
      average(total.measurements.render_time_us, total.measurements.render_samples);
  next.flush_time_us =
      average(total.measurements.flush_time_us, total.measurements.render_samples);
  next.sync_time_us =
      average(total.measurements.sync_time_us, total.measurements.render_samples);
  next.longest_frame_us = total.measurements.longest_frame_us;
  next.longest_work_us = total.measurements.longest_work_us;
  next.longest_gap_us = total.measurements.longest_gap_us;
  next.value_latency_us = average(total.measurements.value_latency_total_us,
                                  total.measurements.value_latency_samples);
  next.value_latency_max_us = total.measurements.value_latency_max_us;
  next.value_latency_samples = total.measurements.value_latency_samples;
  next.invalidated_px =
      average(total.measurements.invalidated_px, total.measurements.frames);
  next.invalidated_areas =
      average(total.measurements.invalidated_areas, total.measurements.frames);
  next.drawn_areas =
      average(total.measurements.drawn_areas, total.measurements.frames);
  next.uptime_ms = static_cast<std::uint64_t>(last_sample_us / 1'000);
  if (heap_refresh_countdown == 0) {
    refresh_heap_and_stacks(next);
    heap_refresh_countdown = kHeapRefreshSamples;
  }
  --heap_refresh_countdown;
  if (fragmentation_refresh_countdown == 0) {
    refresh_fragmentation(next);
    fragmentation_refresh_countdown = kFragmentationRefreshSamples;
  }
  --fragmentation_refresh_countdown;

  last_published = next;
  taskENTER_CRITICAL(&state_lock);
  stats = next;
  taskEXIT_CRITICAL(&state_lock);
}

}
