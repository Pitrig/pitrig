#pragma once

#include <atomic>
#include <cstdint>

namespace simcore::performance {

// Raises a high-water mark to `candidate` if it is higher, from any task. Used
// by the counters the overlay reports, which are written on the task that
// observed the value and read on another; relaxed ordering is enough because
// each counter stands alone and none of them guards other state.
inline void record_maximum(std::atomic<std::uint32_t>& maximum,
                           const std::uint32_t candidate) {
  std::uint32_t current = maximum.load(std::memory_order_relaxed);
  while (candidate > current &&
         !maximum.compare_exchange_weak(current, candidate,
                                        std::memory_order_relaxed)) {
  }
}

enum class TaskMetric : std::uint8_t {
  lvgl,
  transport,
  configuration_control,
  font_asset_control,
  image_asset_control,
  sampler,
  count,
};

struct TaskStackStats {
  std::uint32_t lvgl_free_bytes{};
  std::uint32_t transport_free_bytes{};
  std::uint32_t configuration_free_bytes{};
  std::uint32_t asset_upload_free_bytes{};
  std::uint32_t sampler_free_bytes{};
};

struct PerformanceStats {
  float fps;
  float cpu_core0;
  float cpu_core1;
  // Per rendered frame. Render is drawing only; time spent inside the flush
  // callback or waiting for a flush is reported as flush instead. Sync covers
  // refresh start until render start: layout and the direct-mode buffer copy.
  std::uint32_t render_time_us;
  std::uint32_t flush_time_us;
  std::uint32_t sync_time_us;
  // Longest single frame in the interval, from refresh start to refresh ready.
  // Roughly one panel period while every frame meets its scan-out; a multiple
  // of it means frames are being missed.
  std::uint32_t longest_frame_us;
  // Longest processing part of a frame: sync plus render, without any waiting
  // for the display. A missed scan-out with a normal value here was caused by
  // something other than drawing.
  std::uint32_t longest_work_us;
  // Longest interval between one frame finishing and the next one starting.
  // Shows how long the LVGL task was kept from refreshing.
  std::uint32_t longest_gap_us;
  std::uint32_t free_heap;
  std::uint32_t largest_heap_block;
  std::uint32_t free_psram;
  std::uint64_t uptime_ms;
  TaskStackStats task_stacks;
};

// Starts the one-second statistics sampler.
void begin();
void register_task(TaskMetric metric, void* task_handle);
void unregister_task(TaskMetric metric);

// Records lifecycle events emitted by the rendering platform.
void frame_started();
void frame_finished();
void render_started();
void render_finished();
void flush_started();
void flush_finished();
void flush_wait_started();
void flush_wait_finished();

// Returns a consistent copy of the most recent statistics.
[[nodiscard]] PerformanceStats get_stats();

}  // namespace simcore::performance
