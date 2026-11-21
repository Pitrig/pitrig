#include "usb_serial_jtag_transport.hpp"

#include <algorithm>
#include <span>

#include "driver/usb_serial_jtag.h"
#include "esp_err.h"
#include "esp_log.h"
#include "soc/soc.h"
#include "soc/usb_serial_jtag_reg.h"
#include "transport_watchdog.hpp"

namespace pitrig::transport {
namespace {

constexpr char kTag[] = "usb_serial_jtag_transport";

}

UsbSerialJtagTransport::~UsbSerialJtagTransport() { stop(); }

bool UsbSerialJtagTransport::host_present() { return usb_serial_jtag_is_connected(); }

void UsbSerialJtagTransport::ignore_host_reset() {
  REG_SET_BIT(USB_SERIAL_JTAG_CHIP_RST_REG, USB_SERIAL_JTAG_USB_UART_CHIP_RST_DIS);
}

bool UsbSerialJtagTransport::start(const DataHandler handler, void* const context) {
  if (started_ || handler == nullptr) {
    return false;
  }

  write_mutex_ = xSemaphoreCreateMutexStatic(&write_mutex_state_);
  if (write_mutex_ == nullptr) {
    return false;
  }
  usb_serial_jtag_driver_config_t driver_configuration{
      .tx_buffer_size = kDriverTxBufferSize,
      .rx_buffer_size = kDriverRxBufferSize,
  };
  if (usb_serial_jtag_driver_install(&driver_configuration) != ESP_OK) {
    release_write_mutex();
    return false;
  }
  ignore_host_reset();

  instrumentation_.reset();
  handler_.bind(handler, context);
  started_ = true;
  task_ = xTaskCreateStaticPinnedToCore(&UsbSerialJtagTransport::task_entry, "usb_jtag_rx",
                                        task_stack_.size(), this, kTaskPriority, task_stack_.data(),
                                        &task_state_, PITRIG_COMMUNICATION_CORE);
  if (task_ == nullptr) {
    started_ = false;
    ESP_ERROR_CHECK_WITHOUT_ABORT(usb_serial_jtag_driver_uninstall());
    handler_.release();
    release_write_mutex();
    return false;
  }
  register_read_task(task_);
  ESP_LOGI(kTag, "USB-Serial-JTAG transport started");
  return true;
}

void UsbSerialJtagTransport::silence_logs() {
  if (started_) {
    log_silencer_.silence();
  }
}

void UsbSerialJtagTransport::stop() {
  if (!started_) {
    return;
  }

  started_ = false;
  delete_read_task(task_);
  ESP_ERROR_CHECK_WITHOUT_ABORT(usb_serial_jtag_driver_uninstall());
  handler_.release();
  release_write_mutex();
  log_silencer_.restore();
  ESP_LOGI(kTag, "USB-Serial-JTAG transport stopped");
}

bool UsbSerialJtagTransport::write(const std::span<const std::uint8_t> data) {
  if (!started_ || data.empty() || write_mutex_ == nullptr ||
      xSemaphoreTake(write_mutex_, kWriteTimeout) != pdTRUE) {
    return false;
  }

  std::size_t position = 0;
  while (position < data.size()) {
    const std::size_t chunk = std::min(kWriteChunkSize, data.size() - position);
    if (usb_serial_jtag_write_bytes(data.data() + position, chunk, kWriteStallTimeout) !=
        static_cast<int>(chunk)) {
      break;
    }
    position += chunk;
  }

  xSemaphoreGive(write_mutex_);
  return position == data.size();
}

void UsbSerialJtagTransport::release_write_mutex() {
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
  while (true) {
    const int received = usb_serial_jtag_read_bytes(data.data(), data.size(), kWatchdogFeedTicks);
    feed_watchdog();
    if (received <= 0) {
      continue;
    }

    instrumentation_.record_read(static_cast<std::size_t>(received));
    handler_.dispatch(
        std::span<const std::uint8_t>(data.data(), static_cast<std::size_t>(received)),
        instrumentation_);
  }
}

#if PITRIG_DEBUG
Diagnostics UsbSerialJtagTransport::diagnostics() const {
  Diagnostics diagnostics{};
  instrumentation_.fill(diagnostics);
  return diagnostics;
}
#endif

}
