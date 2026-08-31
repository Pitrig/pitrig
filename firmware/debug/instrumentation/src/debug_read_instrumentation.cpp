#include "debug_read_instrumentation.hpp"

#include "esp_timer.h"
#include "performance.hpp"

namespace simcore::transport {

void ReadInstrumentation::reset() {
  received_bytes_.store(0, std::memory_order_relaxed);
  read_events_.store(0, std::memory_order_relaxed);
  maximum_read_gap_ms_.store(0, std::memory_order_relaxed);
  maximum_handler_time_us_.store(0, std::memory_order_relaxed);
  last_read_at_us_ = 0;
}

void ReadInstrumentation::record_read(const std::size_t bytes) {
  const std::int64_t read_at_us = esp_timer_get_time();
  if (last_read_at_us_ != 0) {
    performance::record_maximum(
        maximum_read_gap_ms_,
        static_cast<std::uint32_t>((read_at_us - last_read_at_us_) / 1'000));
  }
  last_read_at_us_ = read_at_us;
  received_bytes_.fetch_add(static_cast<std::uint64_t>(bytes),
                            std::memory_order_relaxed);
  read_events_.fetch_add(1, std::memory_order_relaxed);
}

std::int64_t ReadInstrumentation::handler_started() {
  return esp_timer_get_time();
}

void ReadInstrumentation::record_handler(const std::int64_t started_at_us) {
  performance::record_maximum(
      maximum_handler_time_us_,
      static_cast<std::uint32_t>(esp_timer_get_time() - started_at_us));
}

void ReadInstrumentation::fill(Diagnostics& diagnostics) const {
  diagnostics.received_bytes = received_bytes_.load(std::memory_order_relaxed);
  diagnostics.read_events = read_events_.load(std::memory_order_relaxed);
  diagnostics.maximum_read_gap_ms =
      maximum_read_gap_ms_.load(std::memory_order_relaxed);
  diagnostics.maximum_handler_time_us =
      maximum_handler_time_us_.load(std::memory_order_relaxed);
}

}
