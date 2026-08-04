#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

#if __has_include("sdkconfig.h")
#include "sdkconfig.h"
#endif
#include "delta_time.hpp"
#include "delta_time_widget.hpp"
#include "lap_timer.hpp"
#include "lap_timer_widget.hpp"
#include "text_widget.hpp"

namespace simcore::configuration {

enum class BoardId : std::uint8_t {
  t_display_s3,
  guition_esp32_4848s040,
};

struct BoardConfiguration {
  BoardId id{BoardId::t_display_s3};
};

[[nodiscard]] const char* board_id_name(BoardId board);
[[nodiscard]] bool board_id_from_name(std::string_view name, BoardId& board);

struct DisplayValidationProfile {
  std::int32_t width{};
  std::int32_t height{};
};

// Private firmware metadata used to validate a public configuration against
// immutable hardware. It is not serialized or exposed by the control protocol.
struct BoardValidationProfile {
  BoardId board{BoardId::t_display_s3};
  DisplayValidationProfile display{};
  int uart_tx_pin{};
  int uart_rx_pin{};
  bool native_usb_cdc_supported{};
};

// Schema 2 reserves a bounded hardware-device section. No user-configurable
// peripheral driver is exposed until firmware implements its complete type,
// validation, and runtime composition path.
struct HardwareConfiguration {
  static constexpr std::size_t kMaximumDevices = 8;
  std::uint8_t device_count{};
};

enum class TelemetryTransportId : std::uint8_t {
  board_default,
  native_usb_cdc,
  uart,
};

struct UartTelemetryConfiguration {
  int port{};
  int tx_pin{43};
  int rx_pin{44};
  std::uint32_t baud_rate{115'200};
  bool silence_esp_logs{true};
};

struct TelemetryTransportConfiguration {
  TelemetryTransportId id{TelemetryTransportId::board_default};
  UartTelemetryConfiguration uart{};
};

struct DashboardConfiguration {
  bool lap_timer_present{};
  dashboard::lap_timer_widget::Config lap_timer{};
  bool delta_time_present{};
  dashboard::delta_time_widget::Config delta_time{};
  std::uint8_t text_widget_count{};
  std::array<dashboard::text_widget::Config,
             dashboard::text_widget::kMaximumInstances>
      text_widgets{};
};

struct ApplicationConfiguration {
  BoardConfiguration board{};
  HardwareConfiguration hardware{};
  bool telemetry_transport_present{};
  TelemetryTransportConfiguration telemetry_transport{};
  bool lap_timer_present{};
  lap_timer::Config lap_timer{};
  bool delta_time_present{};
  delta_time::Config delta_time{};
  DashboardConfiguration dashboard{};
};

inline constexpr BoardId kFactoryBoard{
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
    BoardId::guition_esp32_4848s040
#else
    BoardId::t_display_s3
#endif
};

// A clean flash enables only hardware built into the selected board. The
// board-provided display is initialized by the core; no modules, widgets, or
// additional user-configured hardware devices are created.
inline constexpr std::string_view kFactoryConfigurationJson{
#if CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040
    R"({"board":"guition_esp32_4848s040"})"
#else
    R"({"board":"t_display_s3"})"
#endif
};

}  // namespace simcore::configuration
