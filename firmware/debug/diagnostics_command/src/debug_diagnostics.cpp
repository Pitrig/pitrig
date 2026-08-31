#include "debug_diagnostics.hpp"

#include <cstdint>
#include <cstdio>

#include "esp_heap_caps.h"
#include "performance.hpp"

namespace simcore::debug::diagnostics {
namespace {

struct Tenths {
  unsigned whole;
  unsigned tenth;
};

[[nodiscard]] Tenths tenths(const float value) {
  if (!(value > 0.0F)) {
    return {0U, 0U};
  }
  const auto scaled = static_cast<std::uint32_t>(value * 10.0F + 0.5F);
  return {static_cast<unsigned>(scaled / 10U),
          static_cast<unsigned>(scaled % 10U)};
}

[[nodiscard]] int append(char* const out, const std::size_t size,
                         const int written) {
  if (written <= 0) {
    return 0;
  }
  return static_cast<std::size_t>(written) < size ? written : 0;
}

}

int write(char* const out, const std::size_t size) {
  constexpr std::uint32_t kInternal = MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT;
  constexpr std::uint32_t kExternal = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
  const performance::PerformanceStats stats = performance::get_stats();

  int written = append(
      out, size,
      std::snprintf(
          out, size,
          "@SC:OK:DIAG:internal_total=%u,internal_free=%u,internal_min=%u,"
          "internal_largest=%u,psram_total=%u,psram_free=%u,psram_min=%u,"
          "psram_largest=%u",
          static_cast<unsigned>(heap_caps_get_total_size(kInternal)),
          static_cast<unsigned>(heap_caps_get_free_size(kInternal)),
          static_cast<unsigned>(heap_caps_get_minimum_free_size(kInternal)),
          static_cast<unsigned>(stats.largest_heap_block),
          static_cast<unsigned>(heap_caps_get_total_size(kExternal)),
          static_cast<unsigned>(heap_caps_get_free_size(kExternal)),
          static_cast<unsigned>(heap_caps_get_minimum_free_size(kExternal)),
          static_cast<unsigned>(stats.largest_psram_block)));

  if (written > 0) {
    const Tenths fps = tenths(stats.fps);
    const Tenths cpu0 = tenths(stats.cpu_core0);
    const Tenths cpu1 = tenths(stats.cpu_core1);
    const int field = std::snprintf(
        out + written, size - static_cast<std::size_t>(written),
        ",fps=%u.%u,cpu0=%u.%u,cpu1=%u.%u,render_us=%u,flush_us=%u,"
        "sync_us=%u,frame_max_us=%u,work_max_us=%u,gap_max_us=%u,"
        "inval_px=%u,inval_areas=%u,drawn_areas=%u,"
        "lat_us=%u,lat_max_us=%u,lat_n=%u",
        fps.whole, fps.tenth, cpu0.whole, cpu0.tenth, cpu1.whole, cpu1.tenth,
        static_cast<unsigned>(stats.render_time_us),
        static_cast<unsigned>(stats.flush_time_us),
        static_cast<unsigned>(stats.sync_time_us),
        static_cast<unsigned>(stats.longest_frame_us),
        static_cast<unsigned>(stats.longest_work_us),
        static_cast<unsigned>(stats.longest_gap_us),
        static_cast<unsigned>(stats.invalidated_px),
        static_cast<unsigned>(stats.invalidated_areas),
        static_cast<unsigned>(stats.drawn_areas),
        static_cast<unsigned>(stats.value_latency_us),
        static_cast<unsigned>(stats.value_latency_max_us),
        static_cast<unsigned>(stats.value_latency_samples));
    written = append(out, size, field > 0 ? written + field : 0);
  }

  if (written > 0) {
    const performance::TaskStackStats& stacks = stats.task_stacks;
    const int field = std::snprintf(
        out + written, size - static_cast<std::size_t>(written),
        ",stack_lvgl=%u,stack_transport=%u,stack_control=%u,stack_upload=%u,"
        "stack_sampler=%u,uptime_ms=%llu",
        static_cast<unsigned>(stacks.lvgl_free_bytes),
        static_cast<unsigned>(stacks.transport_free_bytes),
        static_cast<unsigned>(stacks.configuration_free_bytes),
        static_cast<unsigned>(stacks.asset_upload_free_bytes),
        static_cast<unsigned>(stacks.sampler_free_bytes),
        static_cast<unsigned long long>(stats.uptime_ms));
    written = append(out, size, field > 0 ? written + field : 0);
  }

  return written;
}

}
