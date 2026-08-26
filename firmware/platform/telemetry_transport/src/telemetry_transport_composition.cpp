#include "telemetry_transport_composition.hpp"

#include "application_configuration.hpp"
#include "board_registry.hpp"
#if !CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
#include "driver/uart.h"
#endif

namespace simcore::transport {

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
#if !CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
      primary = &usb_cdc_;
#endif
      break;
    case configuration::TelemetryTransportId::uart:
#if !CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
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
  std::size_t count = 1;
#if SIMCORE_SECOND_TELEMETRY_LINK
  if (count < links.size() &&
      usb_serial_jtag_.configure({
          .silence_esp_logs = SIMCORE_SECOND_TELEMETRY_LINK_SILENCE_LOGS != 0,
      })) {
    links[count++] = &usb_serial_jtag_;
  }
#endif
  return count;
}

void TelemetryComposition::silence_logs() {
#if !CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
  uart_.silence_logs();
#endif
#if SIMCORE_SECOND_TELEMETRY_LINK
  usb_serial_jtag_.silence_logs();
#endif
}

}
