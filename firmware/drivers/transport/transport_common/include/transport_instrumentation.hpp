#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>

#include "esp_log.h"
#include "simcore_features.hpp"
#include "transport.hpp"

namespace simcore::transport {

class LogSilencer final {
 public:
  void silence() {
    if (previous_ == nullptr) {
      previous_ = esp_log_set_vprintf(&discard);
    }
  }

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

class ReadInstrumentation final {
 public:
#if SIMCORE_DEBUG
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
#else
  void reset() {}
  void record_read(std::size_t) {}
  [[nodiscard]] static std::int64_t handler_started() { return 0; }
  void record_handler(std::int64_t) {}
  void fill(Diagnostics&) const {}
#endif
};

}
