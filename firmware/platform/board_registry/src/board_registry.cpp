#include "board_registry.hpp"

#include "sdkconfig.h"
#include "ws2812_rmt.hpp"
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C
#include "guition_jc1060p470c_display_driver.hpp"
#include "guition_jc1060p470c_input_driver.hpp"
#elif CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
#include "guition_display_driver.hpp"
#include "guition_input_driver.hpp"
#elif !CONFIG_SIMCORE_FACTORY_BOARD_ESP32S3_DEVKIT
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
          .led = {.pins = {1, 2, 3, 4, 5, 20, 32, 33, 45, 46, 47},
                  .pin_count = 11},
          .uart_tx_pin = 0,
          .uart_rx_pin = 0,
          .uart_supported = false,
          .native_usb_cdc_supported = true,
      },
      .display = &display::drivers::guition_jc1060p470c::get(),
      .input = &input::drivers::guition_jc1060p470c::get(),
      .led = &led::drivers::ws2812_rmt::get(),
      .default_telemetry_transport =
          configuration::TelemetryTransportId::native_usb_cdc,
      .factory_configuration_json = {
          R"({"board":"guition_jc1060p470c"})",
          R"({"board":"guition_jc1060p470c"})",
          R"({"board":"guition_jc1060p470c"})",
      },
  };
#elif CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
  static const BoardDefinition board{
      .id = configuration::BoardId::guition_esp32_4848s040,
      .validation = {
          .board = configuration::BoardId::guition_esp32_4848s040,
          .display = {.width = 480, .height = 480},
          .led = {.pins = {1, 2, 40, 41, 42}, .pin_count = 5},
          .uart_tx_pin = 43,
          .uart_rx_pin = 44,
          .uart_supported = true,
          .native_usb_cdc_supported = false,
      },
      .display = &display::drivers::guition_esp32_4848s040::get(),
      .input = &input::drivers::guition_esp32_4848s040::get(),
      .led = &led::drivers::ws2812_rmt::get(),
      .default_telemetry_transport =
          configuration::TelemetryTransportId::uart,
      .factory_configuration_json = {
          R"({"board":"guition_esp32_4848s040"})",
          R"({"board":"guition_esp32_4848s040"})",
          R"({"board":"guition_esp32_4848s040",)"
          R"("telemetry_transport":{"uart":{"baud_rate":460800}}})",
      },
  };
#elif CONFIG_SIMCORE_FACTORY_BOARD_ESP32S3_DEVKIT
#ifdef CONFIG_SIMCORE_STATUS_LED_GPIO48
  constexpr int kStatusLedPin = 48;
#else
  constexpr int kStatusLedPin = 38;
#endif
  static const led::driver::Configuration status_led{
      .pin = kStatusLedPin,
      .chip = led::driver::Chip::ws2812b,
      .lamps = 1,
  };
  static const BoardDefinition board{
      .id = configuration::BoardId::esp32s3_devkit,
      .validation = {
          .board = configuration::BoardId::esp32s3_devkit,
          .display = {.width = 0, .height = 0},
          .led = {.pins = {4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
                           21},
                  .pin_count = 16,
                  .max_outputs = 3},
          .uart_tx_pin = 43,
          .uart_rx_pin = 44,
          .uart_supported = true,
          .native_usb_cdc_supported = true,
      },
      .display = nullptr,
      .input = nullptr,
      .led = &led::drivers::ws2812_rmt::get(),
      .status_led = &status_led,
      .default_telemetry_transport =
          configuration::TelemetryTransportId::native_usb_cdc,
      .factory_configuration_json = {
          R"({"board":"esp32s3_devkit"})",
          R"({"board":"esp32s3_devkit"})",
          R"({"board":"esp32s3_devkit"})",
      },
  };
#else
  static const BoardDefinition board{
      .id = configuration::BoardId::t_display_s3,
      .validation = {
          .board = configuration::BoardId::t_display_s3,
          .display = {.width = 320, .height = 170},
          .led = {.pins = {1, 2, 10, 11, 12, 13, 16, 17, 18, 21},
                  .pin_count = 10},
          .uart_tx_pin = 43,
          .uart_rx_pin = 44,
          .uart_supported = true,
          .native_usb_cdc_supported = true,
      },
      .display = &display::drivers::t_display_s3::get(),
      .input = nullptr,
      .led = &led::drivers::ws2812_rmt::get(),
      .default_telemetry_transport =
          configuration::TelemetryTransportId::native_usb_cdc,
      .factory_configuration_json = {
          R"({"board":"t_display_s3"})",
          R"({"board":"t_display_s3"})",
          R"({"board":"t_display_s3"})",
      },
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

}
