#include "usb_serial_jtag_transport.hpp"

#include <cstdarg>
#include <span>

#include "driver/usb_serial_jtag.h"
#include "esp_err.h"
#include "esp_log.h"
#if SIMCORE_DEBUG
#include "esp_timer.h"
#include "performance.hpp"
#endif

namespace simcore::transport {
namespace {

constexpr char kTag[] = "usb_serial_jtag_transport";

}  // namespace

UsbSerialJtagTransport::UsbSerialJtagTransport(
    const UsbSerialJtagConfiguration configuration)
    : configuration_(configuration) {}

UsbSerialJtagTransport::~UsbSerialJtagTransport() {
  stop();
}

bool UsbSerialJtagTransport::configure(
    const UsbSerialJtagConfiguration configuration) {
  if (started_) {
    return false;
  }
  configuration_ = configuration;
  return true;
}

bool UsbSerialJtagTransport::start(const DataHandler handler,
                                   void* const context) {
  if (started_ || handler == nullptr) {
    return false;
  }

  stopped_ = xSemaphoreCreateBinaryStatic(&stopped_state_);
  if (stopped_ == nullptr) {
    return false;
  }

  usb_serial_jtag_driver_config_t driver_configuration{
      .tx_buffer_size = kDriverTxBufferSize,
      .rx_buffer_size = kDriverRxBufferSize,
  };
  if (usb_serial_jtag_driver_install(&driver_configuration) != ESP_OK) {
    vSemaphoreDelete(stopped_);
    stopped_ = nullptr;
    return false;
  }

#if SIMCORE_DEBUG
  received_bytes_.store(0, std::memory_order_relaxed);
  read_events_.store(0, std::memory_order_relaxed);
  maximum_read_gap_ms_.store(0, std::memory_order_relaxed);
  maximum_handler_time_us_.store(0, std::memory_order_relaxed);
  last_read_at_us_ = 0;
#endif
  handler_ = handler;
  handler_context_ = context;
  started_ = true;
  running_.store(true, std::memory_order_release);
  task_ = xTaskCreateStatic(&UsbSerialJtagTransport::task_entry,
                            "usb_serial_jtag_rx", task_stack_.size(), this,
                            kTaskPriority, task_stack_.data(), &task_state_);
  if (task_ == nullptr) {
    started_ = false;
    running_.store(false, std::memory_order_release);
    ESP_ERROR_CHECK_WITHOUT_ABORT(usb_serial_jtag_driver_uninstall());
    handler_ = nullptr;
    handler_context_ = nullptr;
    vSemaphoreDelete(stopped_);
    stopped_ = nullptr;
    return false;
  }
#if SIMCORE_DEBUG
  performance::register_task(performance::TaskMetric::transport, task_);
#endif

  // Logged before the silencing below, not after: this line is the only
  // confirmation that the link came up, and silencing first sends it nowhere —
  // which leaves a build that looks identical to one without the link at all.
  ESP_LOGI(kTag, "USB Serial/JTAG telemetry transport started");
  if (configuration_.silence_esp_logs) {
    previous_log_output_ = esp_log_set_vprintf(&discard_log_output);
  }
  return true;
}

void UsbSerialJtagTransport::stop() {
  if (!started_) {
    return;
  }

  started_ = false;
  running_.store(false, std::memory_order_release);
  if (task_ != nullptr) {
#if SIMCORE_DEBUG
    performance::unregister_task(performance::TaskMetric::transport);
#endif
    // One read timeout is all the task needs to notice the flag; waiting for
    // it to say so keeps the driver from being uninstalled under a live read.
    (void)xSemaphoreTake(stopped_, kReadTimeout * 4);
    task_ = nullptr;
  }
  ESP_ERROR_CHECK_WITHOUT_ABORT(usb_serial_jtag_driver_uninstall());
  handler_ = nullptr;
  handler_context_ = nullptr;
  if (stopped_ != nullptr) {
    vSemaphoreDelete(stopped_);
    stopped_ = nullptr;
  }
  restore_log_output();
  ESP_LOGI(kTag, "USB Serial/JTAG telemetry transport stopped");
}

bool UsbSerialJtagTransport::write(const std::span<const std::uint8_t> data) {
  if (!started_ || data.empty()) {
    return false;
  }
  return usb_serial_jtag_write_bytes(data.data(), data.size(), kWriteTimeout) ==
         static_cast<int>(data.size());
}

void UsbSerialJtagTransport::task_entry(void* const context) {
  static_cast<UsbSerialJtagTransport*>(context)->process();
}

int UsbSerialJtagTransport::discard_log_output(const char* const format,
                                               va_list args) {
  (void)format;
  (void)args;
  return 0;
}

void UsbSerialJtagTransport::process() {
  std::array<std::uint8_t, kChunkSize> data{};
  while (running_.load(std::memory_order_acquire)) {
    const int received = usb_serial_jtag_read_bytes(data.data(), data.size(),
                                                    kReadTimeout);
    if (received <= 0) {
      continue;
    }

#if SIMCORE_DEBUG
    const std::int64_t read_at_us = esp_timer_get_time();
    if (last_read_at_us_ != 0) {
      performance::record_maximum(
          maximum_read_gap_ms_,
          static_cast<std::uint32_t>((read_at_us - last_read_at_us_) / 1'000));
    }
    last_read_at_us_ = read_at_us;
    received_bytes_.fetch_add(static_cast<std::uint64_t>(received),
                              std::memory_order_relaxed);
    read_events_.fetch_add(1, std::memory_order_relaxed);
#endif

    if (handler_ != nullptr) {
#if SIMCORE_DEBUG
      const std::int64_t handler_started_at_us = esp_timer_get_time();
#endif
      handler_(std::span<const std::uint8_t>(
                   data.data(), static_cast<std::size_t>(received)),
               handler_context_);
#if SIMCORE_DEBUG
      performance::record_maximum(
          maximum_handler_time_us_,
          static_cast<std::uint32_t>(esp_timer_get_time() -
                                     handler_started_at_us));
#endif
    }
  }

  xSemaphoreGive(stopped_);
  vTaskDelete(nullptr);
}

void UsbSerialJtagTransport::restore_log_output() {
  if (previous_log_output_ != nullptr) {
    esp_log_set_vprintf(previous_log_output_);
    previous_log_output_ = nullptr;
  }
}

Diagnostics UsbSerialJtagTransport::diagnostics() const {
#if SIMCORE_DEBUG
  return {
      .received_bytes = received_bytes_.load(std::memory_order_relaxed),
      .read_events = read_events_.load(std::memory_order_relaxed),
      .fifo_overflows = 0,
      .buffer_full_events = 0,
      .buffered_bytes = 0,
      .maximum_read_gap_ms =
          maximum_read_gap_ms_.load(std::memory_order_relaxed),
      .maximum_handler_time_us =
          maximum_handler_time_us_.load(std::memory_order_relaxed),
  };
#else
  return {};
#endif
}

}  // namespace simcore::transport
