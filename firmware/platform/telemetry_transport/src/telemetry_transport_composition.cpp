#include "telemetry_transport_composition.hpp"

#include "application_configuration.hpp"
#include "board_registry.hpp"
#include "sdkconfig.h"
#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_JC1060P470C
#include "driver/uart.h"
#include "uart_transport.hpp"
#endif
#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_ESP32_4848S040
#include "usb_cdc_transport.hpp"
#endif

namespace pitrig::transport {
namespace {

#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_JC1060P470C
UartTransport g_uart;
#endif
#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_ESP32_4848S040
UsbCdcTransport g_usb_cdc;
#endif

}

ITransport* TelemetryComposition::select(
    const board_registry::BoardDefinition& board,
    const configuration::ApplicationConfiguration& configuration) {
  switch (board_registry::telemetry_transport_id(board, configuration)) {
    case configuration::TelemetryTransportId::native_usb_cdc:
#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_ESP32_4848S040
      return &g_usb_cdc;
#else
      break;
#endif
    case configuration::TelemetryTransportId::uart:
#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_JC1060P470C
      if (g_uart.configure({
              .port = static_cast<uart_port_t>(configuration.telemetry_transport.uart.port),
              .tx_pin = configuration.telemetry_transport.uart.tx_pin,
              .rx_pin = configuration.telemetry_transport.uart.rx_pin,
              .baud_rate = configuration.telemetry_transport.uart.baud_rate,
              .silence_esp_logs = configuration.telemetry_transport.uart.silence_esp_logs,
          })) {
        return &g_uart;
      }
#endif
      break;
    case configuration::TelemetryTransportId::board_default:
      break;
  }
  return nullptr;
}

void TelemetryComposition::silence_logs() {
#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_JC1060P470C
  g_uart.silence_logs();
#endif
}

}
