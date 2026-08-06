#include "telemetry_transport_composition.hpp"

#include "application_configuration.hpp"
#include "board_registry.hpp"
#if !CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
#include "driver/uart.h"
#endif

namespace simcore::transport {

ITransport* TelemetryComposition::select(
    const board_registry::BoardDefinition& board,
    const configuration::ApplicationConfiguration& configuration) {
  switch (board_registry::telemetry_transport_id(board, configuration)) {
    case configuration::TelemetryTransportId::native_usb_cdc:
#if !CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
      return &usb_cdc_;
#else
      return nullptr;
#endif
    case configuration::TelemetryTransportId::uart:
#if !CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
      if (!uart_.configure({
              .port = static_cast<uart_port_t>(
                  configuration.telemetry_transport.uart.port),
              .tx_pin = configuration.telemetry_transport.uart.tx_pin,
              .rx_pin = configuration.telemetry_transport.uart.rx_pin,
              .baud_rate = configuration.telemetry_transport.uart.baud_rate,
              .silence_esp_logs =
                  configuration.telemetry_transport.uart.silence_esp_logs,
          })) {
        return nullptr;
      }
      return &uart_;
#else
      return nullptr;
#endif
    case configuration::TelemetryTransportId::board_default:
      return nullptr;
  }
  return nullptr;
}

}  // namespace simcore::transport
