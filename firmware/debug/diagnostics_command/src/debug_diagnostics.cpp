#include "debug_diagnostics.hpp"

#include <cstdint>
#include <cstdio>

#include "esp_heap_caps.h"
#include "performance.hpp"

extern "C" {
extern volatile std::uint32_t lvgl_port_jit_margin_us;
extern volatile std::uint32_t lvgl_port_jit_hits;
extern volatile std::uint32_t lvgl_port_jit_misses;
extern volatile std::uint32_t lvgl_port_jit_period_us;
extern volatile std::uint32_t lvgl_port_jit_skipped;
extern volatile std::uint32_t lvgl_port_sched_timed;
extern volatile std::uint32_t lvgl_port_sched_fallback;
extern volatile std::uint32_t lvgl_port_sched_empty;
extern volatile std::uint32_t lvgl_port_sched_late;
extern volatile std::uint32_t lvgl_port_sched_fb_unsettled;
extern volatile std::uint32_t lvgl_port_sched_fb_cost;
extern volatile std::uint32_t lvgl_port_sched_fb_late;
extern volatile std::uint32_t lvgl_port_sched_peak_us;
extern volatile std::uint32_t lvgl_port_sched_ema_us;
extern volatile std::uint32_t lvgl_port_sched_best;
extern volatile std::uint32_t lvgl_port_sched_settled;
extern volatile std::uint32_t lvgl_port_cost_span_us;
extern volatile std::uint32_t lvgl_port_cost_wait_us;
extern volatile std::uint32_t lvgl_port_sched_deferred;
extern volatile std::uint32_t lvgl_port_acc_vsyncs;
extern volatile std::uint32_t lvgl_port_acc_swaps;
extern volatile std::uint32_t lvgl_port_acc_start_timer;
extern volatile std::uint32_t lvgl_port_acc_start_late;
extern volatile std::uint32_t lvgl_port_acc_start_fallback;
extern volatile std::uint32_t lvgl_port_acc_start_other;
extern volatile std::uint32_t lvgl_port_acc_empty;
extern volatile std::uint32_t lvgl_port_pkt_bursts;
extern volatile std::uint32_t lvgl_port_pkt_allow_us;
extern volatile std::uint32_t lvgl_port_pkt_period_us;
extern volatile std::uint32_t lvgl_port_sched_tracked;
extern volatile std::uint32_t lvgl_port_sched_untracked;
extern volatile std::uint32_t lvgl_port_sched_burst_armed;
extern volatile std::uint32_t lvgl_port_sched_blocked;
extern volatile std::uint32_t lvgl_port_pkt_lines;
extern volatile std::uint32_t lvgl_port_acc_start_burst;
extern volatile std::uint32_t lvgl_port_acc_miss_all;
extern volatile std::uint32_t lvgl_port_sched_fired;
extern volatile std::uint32_t lvgl_port_feed_jitter_us;
extern volatile std::uint32_t lvgl_port_acc_wake_nothing;
}

namespace pitrig::debug::diagnostics {
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
  return {static_cast<unsigned>(scaled / 10U), static_cast<unsigned>(scaled % 10U)};
}

[[nodiscard]] int append(char* const out, const std::size_t size, const int written) {
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

  int written =
      append(out, size,
             std::snprintf(out, size,
                           "@PR:OK:DIAG:internal_total=%u,internal_free=%u,internal_min=%u,"
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
        static_cast<unsigned>(stats.render_time_us), static_cast<unsigned>(stats.flush_time_us),
        static_cast<unsigned>(stats.sync_time_us), static_cast<unsigned>(stats.longest_frame_us),
        static_cast<unsigned>(stats.longest_work_us), static_cast<unsigned>(stats.longest_gap_us),
        static_cast<unsigned>(stats.invalidated_px), static_cast<unsigned>(stats.invalidated_areas),
        static_cast<unsigned>(stats.drawn_areas), static_cast<unsigned>(stats.value_latency_us),
        static_cast<unsigned>(stats.value_latency_max_us),
        static_cast<unsigned>(stats.value_latency_samples));
    written = append(out, size, field > 0 ? written + field : 0);
  }

  if (written > 0) {
    const int field = std::snprintf(
        out + written, size - static_cast<std::size_t>(written),
        ",jit_margin=%u,jit_hits=%u,jit_misses=%u,jit_period=%u,jit_skipped=%u,sched_timed=%u,"
        "sched_fallback=%u,sched_empty=%u,sched_late=%u,fb_unsettled=%u,fb_cost=%u,fb_late=%u,"
        "sched_peak=%u,sched_ema=%u,sched_best=%u,sched_settled=%u,cost_span=%u,cost_wait=%u,"
        "sched_deferred=%u,acc_vsyncs=%u,acc_swaps=%u,acc_start_timer=%u,acc_start_late=%u,"
        "acc_start_fallback=%u,acc_start_other=%u,acc_empty=%u,pkt_bursts=%u,pkt_allow=%u,"
        "pkt_period=%u,sched_tracked=%u,sched_untracked=%u,sched_burst_armed=%u,"
        "sched_blocked=%u,pkt_lines=%u,acc_start_burst=%u,acc_miss_all=%u,sched_fired=%u,"
        "feed_jitter=%u,wake_nothing=%u",
        static_cast<unsigned>(lvgl_port_jit_margin_us), static_cast<unsigned>(lvgl_port_jit_hits),
        static_cast<unsigned>(lvgl_port_jit_misses), static_cast<unsigned>(lvgl_port_jit_period_us),
        static_cast<unsigned>(lvgl_port_jit_skipped), static_cast<unsigned>(lvgl_port_sched_timed),
        static_cast<unsigned>(lvgl_port_sched_fallback),
        static_cast<unsigned>(lvgl_port_sched_empty), static_cast<unsigned>(lvgl_port_sched_late),
        static_cast<unsigned>(lvgl_port_sched_fb_unsettled),
        static_cast<unsigned>(lvgl_port_sched_fb_cost),
        static_cast<unsigned>(lvgl_port_sched_fb_late),
        static_cast<unsigned>(lvgl_port_sched_peak_us),
        static_cast<unsigned>(lvgl_port_sched_ema_us), static_cast<unsigned>(lvgl_port_sched_best),
        static_cast<unsigned>(lvgl_port_sched_settled),
        static_cast<unsigned>(lvgl_port_cost_span_us),
        static_cast<unsigned>(lvgl_port_cost_wait_us),
        static_cast<unsigned>(lvgl_port_sched_deferred),
        static_cast<unsigned>(lvgl_port_acc_vsyncs), static_cast<unsigned>(lvgl_port_acc_swaps),
        static_cast<unsigned>(lvgl_port_acc_start_timer),
        static_cast<unsigned>(lvgl_port_acc_start_late),
        static_cast<unsigned>(lvgl_port_acc_start_fallback),
        static_cast<unsigned>(lvgl_port_acc_start_other),
        static_cast<unsigned>(lvgl_port_acc_empty), static_cast<unsigned>(lvgl_port_pkt_bursts),
        static_cast<unsigned>(lvgl_port_pkt_allow_us),
        static_cast<unsigned>(lvgl_port_pkt_period_us),
        static_cast<unsigned>(lvgl_port_sched_tracked),
        static_cast<unsigned>(lvgl_port_sched_untracked),
        static_cast<unsigned>(lvgl_port_sched_burst_armed),
        static_cast<unsigned>(lvgl_port_sched_blocked), static_cast<unsigned>(lvgl_port_pkt_lines),
        static_cast<unsigned>(lvgl_port_acc_start_burst),
        static_cast<unsigned>(lvgl_port_acc_miss_all), static_cast<unsigned>(lvgl_port_sched_fired),
        static_cast<unsigned>(lvgl_port_feed_jitter_us),
        static_cast<unsigned>(lvgl_port_acc_wake_nothing));
    written = append(out, size, field > 0 ? written + field : 0);
  }

  if (written > 0) {
    const performance::TaskStackStats& stacks = stats.task_stacks;
    const int field =
        std::snprintf(out + written, size - static_cast<std::size_t>(written),
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
