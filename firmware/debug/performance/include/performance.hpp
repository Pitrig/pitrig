#pragma once

#include <atomic>
#include <cstdint>

namespace simcore::performance {

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
  firmware_update,
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
  std::uint32_t render_time_us;
  std::uint32_t flush_time_us;
  std::uint32_t sync_time_us;
  std::uint32_t longest_frame_us;
  std::uint32_t longest_work_us;
  std::uint32_t longest_gap_us;
  std::uint32_t invalidated_px;
  std::uint32_t invalidated_areas;
  std::uint32_t drawn_areas;
  std::uint32_t free_heap;
  std::uint32_t largest_heap_block;
  std::uint32_t free_psram;
  std::uint32_t largest_psram_block;
  std::uint64_t uptime_ms;
  TaskStackStats task_stacks;
  std::uint32_t value_latency_us;
  std::uint32_t value_latency_max_us;
  std::uint32_t value_latency_samples;
};

void begin();
void register_task(TaskMetric metric, void* task_handle);
void unregister_task(TaskMetric metric);

void value_rendered(std::int64_t committed_at_us);

void frame_started();
void area_invalidated(std::uint32_t pixels);
void frame_finished();
void render_started();
void render_finished();
void flush_started();
void flush_finished();
void flush_wait_started();
void flush_wait_finished();

[[nodiscard]] PerformanceStats get_stats();

}
