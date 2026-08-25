#include <cstddef>
#include <cstdint>
#include <cstdio>

#include "configuration_control.hpp"
#include "simcore_features.hpp"

#if SIMCORE_DEBUG
#include "esp_heap_caps.h"
#include "performance.hpp"
#endif

// The `DIAG` half of configuration control: what the running device costs,
// rather than what it holds. It is the same measurement the debug overlay
// draws, answered on the link instead of on the panel — a board whose limits
// are being measured is a board whose screen is full of the widgets under
// measurement, and reading numbers off it through a camera is neither exact nor
// scriptable.
//
// Debug builds only, because the sampler behind the frame figures is compiled
// only into those; a product build answers `unsupported` so a host learns the
// difference between a command that does not exist and one this image left out.
namespace simcore::configuration {

#if SIMCORE_DEBUG
namespace {

// Whole part and first decimal of a measurement, so the reply is formatted with
// integer conversions only: the C library a device build links leaves `%f` out,
// and a diagnostic that silently printed nothing would be worse than no
// decimal at all.
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

}  // namespace

void ConfigurationControl::send_diagnostics() {
  constexpr std::uint32_t kInternal = MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT;
  constexpr std::uint32_t kExternal = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
  const performance::PerformanceStats stats = performance::get_stats();

  // Memory first, and read here rather than taken from the one-second snapshot:
  // a host that just applied a document wants what that document costs now, not
  // what was true up to a second before it arrived. `min` is the low-water mark
  // since boot, which is the figure a budget is actually set against — a
  // composition that peaked through the floor and recovered still cannot be
  // shipped.
  int written = std::snprintf(
      reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size(),
      "@SC:OK:DIAG:internal_total=%u,internal_free=%u,internal_min=%u,"
      "internal_largest=%u,psram_total=%u,psram_free=%u,psram_min=%u,"
      "psram_largest=%u",
      static_cast<unsigned>(heap_caps_get_total_size(kInternal)),
      static_cast<unsigned>(heap_caps_get_free_size(kInternal)),
      static_cast<unsigned>(heap_caps_get_minimum_free_size(kInternal)),
      static_cast<unsigned>(heap_caps_get_largest_free_block(kInternal)),
      static_cast<unsigned>(heap_caps_get_total_size(kExternal)),
      static_cast<unsigned>(heap_caps_get_free_size(kExternal)),
      static_cast<unsigned>(heap_caps_get_minimum_free_size(kExternal)),
      static_cast<unsigned>(heap_caps_get_largest_free_block(kExternal)));

  // Then the frame, because memory is only half of what a cap costs: a
  // dashboard that fits and misses its scan-out is as far past the limit as one
  // that does not fit. These come from the sampler's last interval, so a host
  // reads them a second after the composition it is measuring settled.
  if (written > 0) {
    const Tenths fps = tenths(stats.fps);
    const Tenths cpu0 = tenths(stats.cpu_core0);
    const Tenths cpu1 = tenths(stats.cpu_core1);
    const int field = std::snprintf(
        reinterpret_cast<char*>(io_buffer_.data()) + written,
        io_buffer_.size() - static_cast<std::size_t>(written),
        ",fps=%u.%u,cpu0=%u.%u,cpu1=%u.%u,render_us=%u,flush_us=%u,"
        "sync_us=%u,frame_max_us=%u,work_max_us=%u,gap_max_us=%u",
        fps.whole, fps.tenth, cpu0.whole, cpu0.tenth, cpu1.whole, cpu1.tenth,
        static_cast<unsigned>(stats.render_time_us),
        static_cast<unsigned>(stats.flush_time_us),
        static_cast<unsigned>(stats.sync_time_us),
        static_cast<unsigned>(stats.longest_frame_us),
        static_cast<unsigned>(stats.longest_work_us),
        static_cast<unsigned>(stats.longest_gap_us));
    written = field > 0 ? written + field : 0;
  }

  // The stacks last: they are the one part of the memory budget that is not on
  // any heap, so a cap raised until a parser recursion or a widget build ran a
  // task dry would show up nowhere else.
  if (written > 0) {
    const performance::TaskStackStats& stacks = stats.task_stacks;
    const int field = std::snprintf(
        reinterpret_cast<char*>(io_buffer_.data()) + written,
        io_buffer_.size() - static_cast<std::size_t>(written),
        ",stack_lvgl=%u,stack_transport=%u,stack_control=%u,stack_upload=%u,"
        "stack_sampler=%u,uptime_ms=%llu",
        static_cast<unsigned>(stacks.lvgl_free_bytes),
        static_cast<unsigned>(stacks.transport_free_bytes),
        static_cast<unsigned>(stacks.configuration_free_bytes),
        static_cast<unsigned>(stacks.asset_upload_free_bytes),
        static_cast<unsigned>(stacks.sampler_free_bytes),
        static_cast<unsigned long long>(stats.uptime_ms));
    written = field > 0 ? written + field : 0;
  }

  if (written > 0 &&
      static_cast<std::size_t>(written) + 1U < io_buffer_.size()) {
    io_buffer_[static_cast<std::size_t>(written)] = '\n';
    (void)write_reply(std::span<const std::uint8_t>(
        io_buffer_.data(), static_cast<std::size_t>(written) + 1U));
  }
}

#else

void ConfigurationControl::send_diagnostics() {
  (void)send_text("@SC:ERR:unsupported\n");
}

#endif

}  // namespace simcore::configuration
