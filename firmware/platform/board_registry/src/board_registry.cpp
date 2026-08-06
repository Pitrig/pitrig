#include "board_registry.hpp"

#include "sdkconfig.h"
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
#include "guition_jc1060p470c_display_driver.hpp"
#elif CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
#include "guition_display_driver.hpp"
#else
#include "t_display_s3_display_driver.hpp"
#endif

namespace simcore::board_registry {

const BoardDefinition& factory_board() {
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
  static const BoardDefinition board{
      .id = configuration::BoardId::guition_jc1060p470c,
      .validation = {
          .board = configuration::BoardId::guition_jc1060p470c,
          .display = {.width = 1'024, .height = 600},
          .uart_tx_pin = 0,
          .uart_rx_pin = 0,
          .uart_supported = false,
          .native_usb_cdc_supported = true,
      },
      .display = display::drivers::guition_jc1060p470c::get(),
      .default_telemetry_transport =
          configuration::TelemetryTransportId::native_usb_cdc,
      .factory_configuration_json =
          R"({"board":"guition_jc1060p470c"})",
  };
#elif CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
  static const BoardDefinition board{
      .id = configuration::BoardId::guition_esp32_4848s040,
      .validation = {
          .board = configuration::BoardId::guition_esp32_4848s040,
          .display = {.width = 480, .height = 480},
          .uart_tx_pin = 43,
          .uart_rx_pin = 44,
          .uart_supported = true,
          .native_usb_cdc_supported = false,
      },
      .display = display::drivers::guition_esp32_4848s040::get(),
      .default_telemetry_transport =
          configuration::TelemetryTransportId::uart,
      .factory_configuration_json =
          R"({"board":"guition_esp32_4848s040"})",
  };
#else
  static const BoardDefinition board{
      .id = configuration::BoardId::t_display_s3,
      .validation = {
          .board = configuration::BoardId::t_display_s3,
          .display = {.width = 320, .height = 170},
          .uart_tx_pin = 43,
          .uart_rx_pin = 44,
          .uart_supported = true,
          .native_usb_cdc_supported = true,
      },
      .display = display::drivers::t_display_s3::get(),
      .default_telemetry_transport =
          configuration::TelemetryTransportId::native_usb_cdc,
      .factory_configuration_json = R"({"board":"t_display_s3"})",
  };
#endif
  return board;
}

configuration::TelemetryTransportId telemetry_transport_id(
    const BoardDefinition& board,
    const configuration::ApplicationConfiguration& application_configuration) {
  using configuration::TelemetryTransportId;

  const auto& configured = application_configuration.telemetry_transport;
  TelemetryTransportId selected =
      application_configuration.telemetry_transport_present
          ? configured.id
          : TelemetryTransportId::board_default;
  if (selected == TelemetryTransportId::board_default) {
    selected = board.default_telemetry_transport;
  }

  return selected;
}

}  // namespace simcore::board_registry
