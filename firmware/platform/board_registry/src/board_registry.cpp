#include "board_registry.hpp"

#include "application_configuration.hpp"
#include "guition_display_driver.hpp"
#include "t_display_s3_display_driver.hpp"
#include "uart_transport.hpp"
#include "usb_cdc_transport.hpp"

namespace simcore::board_registry {

const display::driver::Driver& display_driver() {
  using configuration::BoardId;

  switch (configuration::board_id()) {
    case BoardId::t_display_s3:
      return display::drivers::t_display_s3::get();
    case BoardId::guition_esp32_4848s040:
      return display::drivers::guition_esp32_4848s040::get();
  }

  return display::drivers::t_display_s3::get();
}

transport::ITransport& telemetry_transport() {
  using configuration::BoardId;
  using configuration::TelemetryTransportId;

  static transport::UsbCdcTransport usb_cdc;
  const auto& configured =
      configuration::telemetry_transport_configuration();
  static transport::UartTransport uart({
      .port = static_cast<uart_port_t>(configured.uart.port),
      .tx_pin = configured.uart.tx_pin,
      .rx_pin = configured.uart.rx_pin,
      .baud_rate = configured.uart.baud_rate,
      .silence_esp_logs = configured.uart.silence_esp_logs,
  });

  TelemetryTransportId selected = configured.id;
  if (selected == TelemetryTransportId::board_default) {
    selected = configuration::board_id() == BoardId::guition_esp32_4848s040
                   ? TelemetryTransportId::uart
                   : TelemetryTransportId::native_usb_cdc;
  }

  switch (selected) {
    case TelemetryTransportId::board_default:
      break;
    case TelemetryTransportId::native_usb_cdc:
      return usb_cdc;
    case TelemetryTransportId::uart:
      return uart;
  }

  return usb_cdc;
}

}  // namespace simcore::board_registry
