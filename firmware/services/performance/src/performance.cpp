#include "performance.hpp"

#include "simcore_features.hpp"
#if SIMCORE_DEBUG
#include <algorithm>
#include <array>
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

// Internal to the service: the sampler task is its only caller.
void update();

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
  std::uint64_t sync_time_us;
  std::uint32_t longest_frame_us;
  std::uint32_t longest_work_us;
  std::uint32_t longest_gap_us;
};

portMUX_TYPE state_lock = portMUX_INITIALIZER_UNLOCKED;
PerformanceStats stats{};
Measurements measurements{};
std::int64_t frame_started_at_us;
std::int64_t frame_finished_at_us;
std::int64_t sync_started_at_us;
std::int64_t render_started_at_us;
// Sync plus render of the frame being measured, excluding every wait.
std::uint64_t frame_work_us;
std::int64_t flush_started_at_us;
std::int64_t flush_wait_started_at_us;
// Flush time that elapsed while a render was in progress. LVGL calls the flush
// callback from inside its render pass, so a blocking flush would otherwise be
// counted as drawing.
std::uint64_t render_blocked_us;
std::int64_t last_update_us;
configRUN_TIME_COUNTER_TYPE last_runtime;
configRUN_TIME_COUNTER_TYPE last_idle_core0;
configRUN_TIME_COUNTER_TYPE last_idle_core1;
bool started;
bool frame_in_progress;
StaticTask_t task_buffer;
StackType_t task_stack[kTaskStackDepth];
std::array<TaskHandle_t, static_cast<std::size_t>(TaskMetric::count)>
    monitored_tasks{};

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

// Attributes a completed flush interval to the flush total and, when a render
// is in progress, removes it from that render. Called under state_lock.
void account_flush_interval(std::int64_t& started_at_us,
                            const std::int64_t now_us) {
  if (started_at_us == 0) {
    return;
  }
  const auto elapsed_us = static_cast<std::uint64_t>(now_us - started_at_us);
  measurements.flush_time_us += elapsed_us;
  if (render_started_at_us != 0) {
    render_blocked_us += elapsed_us;
  }
  started_at_us = 0;
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
                "Sync       : %" PRIu32 " us\n"
                "Heap       : %" PRIu32 " KB\n"
                "Largest    : %" PRIu32 " KB\n"
                "PSRAM      : %" PRIu32 " KB\n"
                "================================",
                static_cast<double>(snapshot.fps), static_cast<double>(snapshot.cpu_core0),
                static_cast<double>(snapshot.cpu_core1), snapshot.render_time_us,
                snapshot.flush_time_us, snapshot.sync_time_us, snapshot.free_heap / 1'024,
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
  register_task(TaskMetric::sampler, task);
}

void register_task(const TaskMetric metric, void* const task_handle) {
  taskENTER_CRITICAL(&state_lock);
  monitored_tasks[static_cast<std::size_t>(metric)] =
      static_cast<TaskHandle_t>(task_handle);
  taskEXIT_CRITICAL(&state_lock);
}

void unregister_task(const TaskMetric metric) {
  register_task(metric, nullptr);
}

void frame_started() {
  const std::int64_t now_us = esp_timer_get_time();
  taskENTER_CRITICAL(&state_lock);
  frame_in_progress = true;
  frame_started_at_us = now_us;
  sync_started_at_us = now_us;
  frame_work_us = 0;
  if (frame_finished_at_us != 0) {
    const auto gap_us = static_cast<std::uint32_t>(now_us - frame_finished_at_us);
    if (gap_us > measurements.longest_gap_us) {
      measurements.longest_gap_us = gap_us;
    }
  }
  taskEXIT_CRITICAL(&state_lock);
}

void frame_finished() {
  const std::int64_t now_us = esp_timer_get_time();
  taskENTER_CRITICAL(&state_lock);
  if (frame_in_progress) {
    ++measurements.frames;
    frame_in_progress = false;
    frame_finished_at_us = now_us;
    const auto elapsed_us =
        static_cast<std::uint32_t>(now_us - frame_started_at_us);
    if (elapsed_us > measurements.longest_frame_us) {
      measurements.longest_frame_us = elapsed_us;
    }
    const auto work_us = static_cast<std::uint32_t>(frame_work_us);
    if (work_us > measurements.longest_work_us) {
      measurements.longest_work_us = work_us;
    }
  }
  taskEXIT_CRITICAL(&state_lock);
}

void render_started() {
  const std::int64_t now_us = esp_timer_get_time();
  taskENTER_CRITICAL(&state_lock);
  if (sync_started_at_us != 0) {
    const auto sync_us = static_cast<std::uint64_t>(now_us - sync_started_at_us);
    measurements.sync_time_us += sync_us;
    frame_work_us += sync_us;
    sync_started_at_us = 0;
  }
  render_started_at_us = now_us;
  render_blocked_us = 0;
  taskEXIT_CRITICAL(&state_lock);
}

void render_finished() {
  const std::int64_t now_us = esp_timer_get_time();
  taskENTER_CRITICAL(&state_lock);
  if (render_started_at_us != 0) {
    const auto elapsed_us =
        static_cast<std::uint64_t>(now_us - render_started_at_us);
    const std::uint64_t drawing_us =
        elapsed_us > render_blocked_us ? elapsed_us - render_blocked_us : 0;
    measurements.render_time_us += drawing_us;
    frame_work_us += drawing_us;
    ++measurements.render_samples;
    render_started_at_us = 0;
    render_blocked_us = 0;
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
  account_flush_interval(flush_started_at_us, now_us);
  taskEXIT_CRITICAL(&state_lock);
}

void flush_wait_started() {
  const std::int64_t now_us = esp_timer_get_time();
  taskENTER_CRITICAL(&state_lock);
  flush_wait_started_at_us = now_us;
  taskEXIT_CRITICAL(&state_lock);
}

void flush_wait_finished() {
  const std::int64_t now_us = esp_timer_get_time();
  taskENTER_CRITICAL(&state_lock);
  account_flush_interval(flush_wait_started_at_us, now_us);
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
      .font_assets_free_bytes = stack_free_bytes(
          task_handles[static_cast<std::size_t>(TaskMetric::font_asset_control)]),
      .sampler_free_bytes = stack_free_bytes(
          task_handles[static_cast<std::size_t>(TaskMetric::sampler)]),
  };

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
