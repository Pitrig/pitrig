#pragma once

#include <cstdint>

namespace simcore::performance {

enum class TaskMetric : std::uint8_t {
  lvgl,
  transport,
  configuration_control,
  font_asset_control,
  sampler,
  count,
};

struct TaskStackStats {
  std::uint32_t lvgl_free_bytes{};
  std::uint32_t transport_free_bytes{};
  std::uint32_t configuration_free_bytes{};
  std::uint32_t font_assets_free_bytes{};
  std::uint32_t sampler_free_bytes{};
};

struct PerformanceStats {
  float fps;
  float cpu_core0;
  float cpu_core1;
  std::uint32_t render_time_us;
  std::uint32_t flush_time_us;
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

// Produces the next statistics snapshot from collected measurements.
void update();

// Returns a consistent copy of the most recent statistics.
[[nodiscard]] PerformanceStats get_stats();

}  // namespace simcore::performance
