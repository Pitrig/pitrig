#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>

#include "esp_log.h"
#include "simcore_features.hpp"
#include "transport.hpp"

namespace simcore::transport {

// A link that carries telemetry cannot also carry ESP log lines: they would
// interleave with the protocol on the same wire. Silencing is global, so it is
// restored the moment the link stops.
class LogSilencer final {
 public:
  void silence() { previous_ = esp_log_set_vprintf(&discard); }

  void restore() {
    if (previous_ != nullptr) {
      esp_log_set_vprintf(previous_);
      previous_ = nullptr;
    }
  }

 private:
  static int discard(const char* const format, va_list args) {
    (void)format;
    (void)args;
    return 0;
  }

  vprintf_like_t previous_{};
};

// What every serial link reports about its own read path. Each driver used to
// keep its own copy of these four counters and of the timing arithmetic around
// them, which is why the three of them did not report the same numbers.
// Counters that describe one peripheral — a UART FIFO overflow, a CDC queue
// depth — stay with that driver.
class ReadInstrumentation final {
 public:
#if SIMCORE_DEBUG
  void reset();
  // One completed read of `bytes`, timed against the previous one.
  void record_read(std::size_t bytes);
  // Opens a handler measurement; the result goes back to record_handler.
  [[nodiscard]] static std::int64_t handler_started();
  void record_handler(std::int64_t started_at_us);
  // Fills the fields every link has in common, leaving the rest to the driver.
  void fill(Diagnostics& diagnostics) const;

 private:
  std::atomic<std::uint64_t> received_bytes_{};
  std::atomic<std::uint64_t> read_events_{};
  std::atomic<std::uint32_t> maximum_read_gap_ms_{};
  std::atomic<std::uint32_t> maximum_handler_time_us_{};
  std::int64_t last_read_at_us_{};
#else
  // Compiled away in a product build, exactly as the #if blocks it replaces.
  void reset() {}
  void record_read(std::size_t) {}
  [[nodiscard]] static std::int64_t handler_started() { return 0; }
  void record_handler(std::int64_t) {}
  void fill(Diagnostics&) const {}
#endif
};

}  // namespace simcore::transport
