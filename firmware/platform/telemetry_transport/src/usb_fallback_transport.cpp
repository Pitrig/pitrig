#include "usb_fallback_transport.hpp"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace pitrig::transport {
namespace {

constexpr char kTag[] = "usb_fallback_transport";
constexpr TickType_t kNativeHostWait = pdMS_TO_TICKS(2'000);
constexpr TickType_t kNativeHostPoll = pdMS_TO_TICKS(50);

bool stays_on_native(const UsbCdcTransport& native) {
  if (!UsbSerialJtagTransport::host_present()) {
    return true;
  }
  for (TickType_t waited = 0; waited < kNativeHostWait; waited += kNativeHostPoll) {
    if (native.host_connected()) {
      return true;
    }
    vTaskDelay(kNativeHostPoll);
  }
  return native.host_connected();
}

}

bool UsbFallbackTransport::start(const DataHandler handler, void* const context) {
  if (!std::holds_alternative<std::monostate>(port_)) {
    return false;
  }
  UsbCdcTransport& native = port_.emplace<UsbCdcTransport>();
  if (native.start(handler, context) && stays_on_native(native)) {
    return true;
  }
  if (port_.emplace<UsbSerialJtagTransport>().start(handler, context)) {
    ESP_LOGI(kTag, "No host on native USB; the link runs on the USB-Serial-JTAG port");
    return true;
  }
  port_.emplace<std::monostate>();
  return false;
}

void UsbFallbackTransport::stop() { port_.emplace<std::monostate>(); }

bool UsbFallbackTransport::write(const std::span<const std::uint8_t> data) {
  ITransport* const port = active();
  return port != nullptr && port->write(data);
}

void UsbFallbackTransport::silence_logs() {
  if (UsbSerialJtagTransport* const fallback = std::get_if<UsbSerialJtagTransport>(&port_)) {
    fallback->silence_logs();
  }
}

ITransport* UsbFallbackTransport::active() {
  if (UsbCdcTransport* const native = std::get_if<UsbCdcTransport>(&port_)) {
    return native;
  }
  return std::get_if<UsbSerialJtagTransport>(&port_);
}

#if PITRIG_DEBUG
Diagnostics UsbFallbackTransport::diagnostics() const {
  if (const UsbCdcTransport* const native = std::get_if<UsbCdcTransport>(&port_)) {
    return native->diagnostics();
  }
  if (const UsbSerialJtagTransport* const fallback = std::get_if<UsbSerialJtagTransport>(&port_)) {
    return fallback->diagnostics();
  }
  return {};
}
#endif

}
