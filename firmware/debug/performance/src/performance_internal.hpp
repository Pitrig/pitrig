#pragma once

#include <array>
#include <cstdint>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "performance.hpp"

namespace simcore::performance::internal {

struct Measurements {
  std::uint32_t frames;
  std::uint64_t render_time_us;
  std::uint32_t render_samples;
  std::uint64_t flush_time_us;
  std::uint64_t sync_time_us;
  std::uint32_t longest_frame_us;
  std::uint32_t longest_work_us;
  std::uint32_t longest_gap_us;
  std::uint64_t invalidated_px;
  std::uint32_t invalidated_areas;
  std::uint32_t drawn_areas;
  std::uint64_t value_latency_total_us;
  std::uint32_t value_latency_max_us;
  std::uint32_t value_latency_samples;
};

extern portMUX_TYPE state_lock;
extern PerformanceStats stats;
extern Measurements measurements;
extern std::array<TaskHandle_t, static_cast<std::size_t>(TaskMetric::count)>
    monitored_tasks;

}

namespace simcore::performance {

void update();

}
