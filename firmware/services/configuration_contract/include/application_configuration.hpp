#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

#include "font_asset_types.hpp"
#include "time_transform.hpp"

namespace simcore::configuration {

inline constexpr std::uint32_t kTransparentColor = 0xFFFF'FFFFU;
inline constexpr std::size_t kMaximumTextWidgets = 16;
inline constexpr std::size_t kMaximumValueModifiers = 4;
inline constexpr std::size_t kWidgetTitleCapacity = 16;
inline constexpr std::size_t kUnavailableTextCapacity = 16;
inline constexpr std::size_t kDeltaTimeTextCapacity = 16;
inline constexpr std::size_t kValueBindingCapacity = 40;

enum class BoardId : std::uint8_t {
  t_display_s3,
  guition_esp32_4848s040,
  guition_jc1060p470c,
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
struct ValidationContext {
  BoardId board{BoardId::t_display_s3};
  DisplayValidationProfile display{};
  int uart_tx_pin{};
  int uart_rx_pin{};
  bool uart_supported{};
  bool native_usb_cdc_supported{};
};

// Schema 2 reserves a bounded hardware-device section. No user-configurable
// peripheral driver is exposed until firmware implements its complete type,
// validation, and application composition path.
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

enum class DeltaTimeUnavailableBehavior : std::uint8_t {
  hide,
  placeholder,
  zero,
};

struct DeltaTimeScaleConfiguration {
  bool enabled{false};
  bool show_sign{false};
  std::int32_t range_ms{2'000};
};

struct DeltaTimeConfiguration {
  DeltaTimeUnavailableBehavior unavailable_behavior{
      DeltaTimeUnavailableBehavior::hide};
  std::array<char, kDeltaTimeTextCapacity> placeholder{'-', '-', '-', '\0'};
  DeltaTimeScaleConfiguration scale{};
};

struct WidgetPlacement {
  std::int32_t x{};
  std::int32_t y{};
  std::int32_t width{};
  std::int32_t height{};
};

struct WidgetInsets {
  std::uint16_t left{};
  std::uint16_t top{};
  std::uint16_t right{};
  std::uint16_t bottom{};
};

struct DeltaTimeScaleStyle {
  std::uint16_t vertical_padding_px{2};
  std::uint16_t border_width_px{2};
  std::uint16_t border_radius_px{8};
};

struct DeltaTimeWidgetConfiguration {
  font_assets::FontSpec font{};
  WidgetPlacement placement{};
  std::int16_t z_index{};
  std::uint32_t faster_color{0x00C853};
  std::uint32_t slower_color{0xD50000};
  std::uint32_t neutral_color{0xE8E8E8};
  DeltaTimeScaleStyle scale{};
};

enum class TextAlignment : std::uint8_t {
  left,
  center,
  right,
};

struct WidgetBorder {
  std::uint32_t color{0xAEAEAE};
  std::uint16_t width_px{};
  std::uint16_t radius_px{};
};

struct WidgetTitleStyle {
  std::array<char, kWidgetTitleCapacity> text{};
  font_assets::FontSpec font{};
  std::uint32_t color{0xE8E8E8};
  std::int16_t offset_y_px{};
};

struct WidgetValueStyle {
  font_assets::FontSpec font{};
  std::uint32_t color{0xE8E8E8};
  TextAlignment alignment{TextAlignment::center};
  std::array<char, kUnavailableTextCapacity> unavailable_text{
      '-', '-', '\0'};
};

using ValueBinding = std::array<char, kValueBindingCapacity>;

[[nodiscard]] constexpr ValueBinding make_value_binding(
    const std::string_view name) {
  ValueBinding result{};
  if (name.size() >= result.size()) {
    return result;
  }
  for (std::size_t index = 0; index < name.size(); ++index) {
    result[index] = name[index];
  }
  return result;
}

[[nodiscard]] inline std::string_view value_binding_view(
    const ValueBinding& binding) {
  std::size_t length{};
  while (length < binding.size() && binding[length] != '\0') {
    ++length;
  }
  return {binding.data(), length};
}

enum class ValueTransformType : std::uint8_t {
  none,
  time,
};

struct ValueTransform {
  ValueTransformType type{ValueTransformType::none};
  transformers::time_transform::Config time{};
};

enum class ValueModifierType : std::uint8_t {
  lap_timer,
};

struct ValueModifier {
  ValueModifierType type{ValueModifierType::lap_timer};
};

struct TextWidgetConfiguration {
  ValueBinding binding{make_value_binding("vehicle.speed")};
  std::uint8_t modifier_count{};
  std::array<ValueModifier, kMaximumValueModifiers> modifiers{};
  ValueTransform transform{};
  WidgetPlacement placement{};
  std::int16_t z_index{};
  WidgetInsets padding{};
  WidgetBorder border{};
  WidgetTitleStyle title{};
  WidgetValueStyle value{};
  std::uint32_t background_color{kTransparentColor};
};

struct DashboardConfiguration {
  std::uint32_t background_color{};
  bool delta_time_present{};
  DeltaTimeWidgetConfiguration delta_time{};
  std::uint8_t text_widget_count{};
  std::array<TextWidgetConfiguration, kMaximumTextWidgets> text_widgets{};
};

struct ApplicationConfiguration {
  BoardConfiguration board{};
  HardwareConfiguration hardware{};
  bool telemetry_transport_present{};
  TelemetryTransportConfiguration telemetry_transport{};
  bool delta_time_present{};
  DeltaTimeConfiguration delta_time{};
  DashboardConfiguration dashboard{};
};

}  // namespace simcore::configuration
