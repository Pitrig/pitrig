#include "telemetry_transport_composition.hpp"

#include "application_configuration.hpp"
#include "board_registry.hpp"
#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_JC1060P470C
#include "driver/uart.h"
#endif

namespace pitrig::transport {

std::size_t TelemetryComposition::select(
    const board_registry::BoardDefinition& board,
    const configuration::ApplicationConfiguration& configuration,
    const std::span<ITransport*> links) {
  if (links.empty()) {
    return 0;
  }
  ITransport* primary = nullptr;
  switch (board_registry::telemetry_transport_id(board, configuration)) {
    case configuration::TelemetryTransportId::native_usb_cdc:
#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_ESP32_4848S040
      primary = &usb_cdc_;
#endif
      break;
    case configuration::TelemetryTransportId::uart:
#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_JC1060P470C
      if (uart_.configure({
              .port = static_cast<uart_port_t>(
                  configuration.telemetry_transport.uart.port),
              .tx_pin = configuration.telemetry_transport.uart.tx_pin,
              .rx_pin = configuration.telemetry_transport.uart.rx_pin,
              .baud_rate = configuration.telemetry_transport.uart.baud_rate,
              .silence_esp_logs =
                  configuration.telemetry_transport.uart.silence_esp_logs,
          })) {
        primary = &uart_;
      }
#endif
      break;
    case configuration::TelemetryTransportId::board_default:
      break;
  }
  if (primary == nullptr) {
    return 0;
  }
  links[0] = primary;
  return 1;
}

void TelemetryComposition::silence_logs() {
#if !CONFIG_PITRIG_FACTORY_BOARD_GUITION_JC1060P470C
  uart_.silence_logs();
#endif
}

}
