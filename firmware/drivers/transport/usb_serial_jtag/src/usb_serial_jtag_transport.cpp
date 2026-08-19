#include "usb_serial_jtag_transport.hpp"

#include <span>

#include "driver/usb_serial_jtag.h"
#include "esp_err.h"
#include "esp_log.h"
#include "simcore_features.hpp"
#if SIMCORE_DEBUG
#include "performance.hpp"
#endif

namespace simcore::transport {
namespace {

constexpr char kTag[] = "usb_serial_jtag_transport";

}  // namespace

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

  instrumentation_.reset();
  handler_ = handler;
  handler_context_ = context;
  started_ = true;
  running_.store(true, std::memory_order_release);
  task_ = xTaskCreateStaticPinnedToCore(
      &UsbSerialJtagTransport::task_entry, "usb_serial_jtag_rx",
      task_stack_.size(), this, kTaskPriority, task_stack_.data(),
      &task_state_, SIMCORE_COMMUNICATION_CORE);
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
    log_silencer_.silence();
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
  log_silencer_.restore();
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

void UsbSerialJtagTransport::process() {
  std::array<std::uint8_t, kChunkSize> data{};
  while (running_.load(std::memory_order_acquire)) {
    const int received = usb_serial_jtag_read_bytes(data.data(), data.size(),
                                                    kReadTimeout);
    if (received <= 0) {
      continue;
    }

    instrumentation_.record_read(static_cast<std::size_t>(received));

    if (handler_ != nullptr) {
      const std::int64_t handler_started_at_us =
          ReadInstrumentation::handler_started();
      handler_(std::span<const std::uint8_t>(
                   data.data(), static_cast<std::size_t>(received)),
               handler_context_);
      instrumentation_.record_handler(handler_started_at_us);
    }
  }

  xSemaphoreGive(stopped_);
  vTaskDelete(nullptr);
}

Diagnostics UsbSerialJtagTransport::diagnostics() const {
  Diagnostics diagnostics{};
  instrumentation_.fill(diagnostics);
  return diagnostics;
}

}  // namespace simcore::transport
