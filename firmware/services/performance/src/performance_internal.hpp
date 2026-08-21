#pragma once

#include "simcore_features.hpp"
#if SIMCORE_DEBUG

#include <array>
#include <cstdint>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "performance.hpp"

// What the two halves of the service share: the instrumentation hooks in
// performance.cpp accumulate into `measurements` under `state_lock`, and the
// sampler task in performance_sampler.cpp drains them into `stats` once a
// second. Internal to the service; everything outside reads get_stats().
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
};

extern portMUX_TYPE state_lock;
extern PerformanceStats stats;
extern Measurements measurements;
extern std::array<TaskHandle_t, static_cast<std::size_t>(TaskMetric::count)>
    monitored_tasks;

}  // namespace simcore::performance::internal

namespace simcore::performance {

// One aggregation pass, run by the sampler task once a second.
void update();

}  // namespace simcore::performance

#endif
