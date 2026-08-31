#include "performance.hpp"

#include <array>
#include <cstdint>

#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "performance_internal.hpp"

namespace simcore::performance {

namespace internal {

portMUX_TYPE state_lock = portMUX_INITIALIZER_UNLOCKED;
PerformanceStats stats{};
Measurements measurements{};
std::array<TaskHandle_t, static_cast<std::size_t>(TaskMetric::count)>
    monitored_tasks{};

}

using namespace internal;

namespace {

std::int64_t frame_started_at_us;
std::int64_t frame_finished_at_us;
std::int64_t sync_started_at_us;
std::int64_t render_started_at_us;
std::uint64_t frame_work_us;
std::int64_t flush_started_at_us;
std::int64_t flush_wait_started_at_us;
std::uint64_t render_blocked_us;
bool frame_in_progress;
std::int64_t pending_value_commit_us;

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

void area_invalidated(const std::uint32_t pixels) {
  taskENTER_CRITICAL(&state_lock);
  measurements.invalidated_px += pixels;
  ++measurements.invalidated_areas;
  taskEXIT_CRITICAL(&state_lock);
}

void value_rendered(const std::int64_t committed_at_us) {
  if (committed_at_us == 0) {
    return;
  }
  taskENTER_CRITICAL(&state_lock);
  if (pending_value_commit_us == 0 ||
      committed_at_us < pending_value_commit_us) {
    pending_value_commit_us = committed_at_us;
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
    if (pending_value_commit_us != 0) {
      const auto latency_us =
          static_cast<std::uint32_t>(now_us - pending_value_commit_us);
      measurements.value_latency_total_us += latency_us;
      ++measurements.value_latency_samples;
      if (latency_us > measurements.value_latency_max_us) {
        measurements.value_latency_max_us = latency_us;
      }
      pending_value_commit_us = 0;
    }
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
  ++measurements.drawn_areas;
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

PerformanceStats get_stats() {
  taskENTER_CRITICAL(&state_lock);
  const PerformanceStats snapshot = stats;
  taskEXIT_CRITICAL(&state_lock);
  return snapshot;
}

}
