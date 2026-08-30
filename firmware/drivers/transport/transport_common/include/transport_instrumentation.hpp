#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "simcore_features.hpp"
#include "transport.hpp"

namespace simcore::transport {

void register_read_task(TaskHandle_t task);

void unregister_read_task();

void delete_read_task(TaskHandle_t& task);

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

class ReadHandler final {
 public:
  void bind(const DataHandler handler, void* const context) {
    context_ = context;
    handler_ = handler;
  }

  void release() {
    handler_ = nullptr;
    context_ = nullptr;
  }

  [[nodiscard]] bool bound() const { return handler_ != nullptr; }

  template <typename Instrumentation>
  void dispatch(const std::span<const std::uint8_t> data,
                Instrumentation& instrumentation) const {
    if (handler_ == nullptr) {
      return;
    }
    const std::int64_t started_at_us = Instrumentation::handler_started();
    handler_(data, context_);
    instrumentation.record_handler(started_at_us);
  }

 private:
  DataHandler handler_{};
  void* context_{};
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
