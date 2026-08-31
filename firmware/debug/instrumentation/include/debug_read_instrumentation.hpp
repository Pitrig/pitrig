#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>

#include "transport.hpp"

namespace simcore::transport {

class ReadInstrumentation final {
 public:
  void reset();
  void record_read(std::size_t bytes);
  [[nodiscard]] static std::int64_t handler_started();
  void record_handler(std::int64_t started_at_us);
  void fill(Diagnostics& diagnostics) const;

 private:
  std::atomic<std::uint64_t> received_bytes_{};
  std::atomic<std::uint64_t> read_events_{};
  std::atomic<std::uint32_t> maximum_read_gap_ms_{};
  std::atomic<std::uint32_t> maximum_handler_time_us_{};
  std::int64_t last_read_at_us_{};
};

}
