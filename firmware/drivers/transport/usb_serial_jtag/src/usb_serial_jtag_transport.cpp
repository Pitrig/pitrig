#include "usb_serial_jtag_transport.hpp"

#include <algorithm>
#include <span>

#include "driver/usb_serial_jtag.h"
#include "esp_err.h"
#include "esp_log.h"
#include "simcore_features.hpp"
#include "transport_watchdog.hpp"

namespace simcore::transport {
namespace {

constexpr char kTag[] = "usb_serial_jtag_transport";

}

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
  write_mutex_ = xSemaphoreCreateMutexStatic(&write_mutex_state_);
  if (stopped_ == nullptr || write_mutex_ == nullptr) {
    release_rtos_objects();
    return false;
  }

  usb_serial_jtag_driver_config_t driver_configuration{
      .tx_buffer_size = kDriverTxBufferSize,
      .rx_buffer_size = kDriverRxBufferSize,
  };
  if (usb_serial_jtag_driver_install(&driver_configuration) != ESP_OK) {
    release_rtos_objects();
    return false;
  }

  instrumentation_.reset();
  handler_.bind(handler, context);
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
    handler_.release();
    release_rtos_objects();
    return false;
  }
  register_read_task(task_);
  ESP_LOGI(kTag, "USB Serial/JTAG telemetry transport started");
  return true;
}

void UsbSerialJtagTransport::silence_logs() {
  if (started_ && configuration_.silence_esp_logs) {
    log_silencer_.silence();
  }
}

void UsbSerialJtagTransport::stop() {
  if (!started_) {
    return;
  }

  started_ = false;
  running_.store(false, std::memory_order_release);
  if (task_ != nullptr) {
    unregister_read_task();
    (void)xSemaphoreTake(stopped_, kReadTimeout * 4);
    task_ = nullptr;
  }
  ESP_ERROR_CHECK_WITHOUT_ABORT(usb_serial_jtag_driver_uninstall());
  handler_.release();
  release_rtos_objects();
  log_silencer_.restore();
  ESP_LOGI(kTag, "USB Serial/JTAG telemetry transport stopped");
}

bool UsbSerialJtagTransport::write(const std::span<const std::uint8_t> data) {
  if (!started_ || data.empty() || write_mutex_ == nullptr ||
      xSemaphoreTake(write_mutex_, kWriteTimeout) != pdTRUE) {
    return false;
  }

  const TickType_t started_at = xTaskGetTickCount();
  std::size_t position = 0;
  while (position < data.size()) {
    const TickType_t elapsed = xTaskGetTickCount() - started_at;
    if (elapsed >= kWriteTimeout) {
      break;
    }
    const std::size_t chunk = std::min(kWriteChunkSize, data.size() - position);
    if (usb_serial_jtag_write_bytes(data.data() + position, chunk,
                                    kWriteTimeout - elapsed) !=
        static_cast<int>(chunk)) {
      break;
    }
    position += chunk;
  }

  xSemaphoreGive(write_mutex_);
  return position == data.size();
}

void UsbSerialJtagTransport::release_rtos_objects() {
  if (stopped_ != nullptr) {
    vSemaphoreDelete(stopped_);
    stopped_ = nullptr;
  }
  if (write_mutex_ != nullptr) {
    vSemaphoreDelete(write_mutex_);
    write_mutex_ = nullptr;
  }
}

void UsbSerialJtagTransport::task_entry(void* const context) {
  static_cast<UsbSerialJtagTransport*>(context)->process();
}

void UsbSerialJtagTransport::process() {
  std::array<std::uint8_t, kChunkSize> data{};
  watch_current_task();
  while (running_.load(std::memory_order_acquire)) {
    const int received = usb_serial_jtag_read_bytes(data.data(), data.size(),
                                                    kReadTimeout);
    feed_watchdog();
    if (received <= 0) {
      continue;
    }

    instrumentation_.record_read(static_cast<std::size_t>(received));
    handler_.dispatch(
        std::span<const std::uint8_t>(data.data(),
                                      static_cast<std::size_t>(received)),
        instrumentation_);
  }

  unwatch_current_task();
  xSemaphoreGive(stopped_);
  vTaskDelete(nullptr);
}

Diagnostics UsbSerialJtagTransport::diagnostics() const {
  Diagnostics diagnostics{};
  instrumentation_.fill(diagnostics);
  return diagnostics;
}

}
