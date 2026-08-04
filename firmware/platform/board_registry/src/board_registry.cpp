#include "board_registry.hpp"

#include "application_configuration.hpp"
#include "guition_display_driver.hpp"
#include "t_display_s3_display_driver.hpp"
#include "uart_transport.hpp"
#include "usb_cdc_transport.hpp"

namespace simcore::board_registry {

configuration::BoardValidationProfile validation_profile(
    const configuration::BoardId board) {
  using configuration::BoardId;

  switch (board) {
    case BoardId::t_display_s3:
      return {
          .board = board,
          .display = {.width = 320, .height = 170},
          .uart_tx_pin = 43,
          .uart_rx_pin = 44,
          .native_usb_cdc_supported = true,
      };
    case BoardId::guition_esp32_4848s040:
      return {
          .board = board,
          .display = {.width = 480, .height = 480},
          .uart_tx_pin = 43,
          .uart_rx_pin = 44,
          .native_usb_cdc_supported = false,
      };
  }
  return {};
}

const display::driver::Driver& display_driver(
    const configuration::BoardId board) {
  using configuration::BoardId;

  switch (board) {
    case BoardId::t_display_s3:
      return display::drivers::t_display_s3::get();
    case BoardId::guition_esp32_4848s040:
      return display::drivers::guition_esp32_4848s040::get();
  }
  return display::drivers::t_display_s3::get();
}

transport::ITransport& telemetry_transport(
    const configuration::ApplicationConfiguration& application_configuration) {
  using configuration::BoardId;
  using configuration::TelemetryTransportId;

  static transport::UsbCdcTransport usb_cdc;
  const auto& configured = application_configuration.telemetry_transport;
  static transport::UartTransport uart({
      .port = static_cast<uart_port_t>(configured.uart.port),
      .tx_pin = configured.uart.tx_pin,
      .rx_pin = configured.uart.rx_pin,
      .baud_rate = configured.uart.baud_rate,
      .silence_esp_logs = configured.uart.silence_esp_logs,
  });

  TelemetryTransportId selected =
      application_configuration.telemetry_transport_present
          ? configured.id
          : TelemetryTransportId::board_default;
  if (selected == TelemetryTransportId::board_default) {
    selected = application_configuration.board.id ==
                       BoardId::guition_esp32_4848s040
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
