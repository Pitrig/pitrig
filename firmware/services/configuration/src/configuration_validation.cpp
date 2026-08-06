#include "configuration_json.hpp"

#include <algorithm>
#include <string_view>

namespace simcore::configuration {
namespace {

[[nodiscard]] bool valid_color(const std::uint32_t color) {
  return color <= 0x00FF'FFFFU;
}

[[nodiscard]] bool valid_optional_color(const std::uint32_t color) {
  return color == kTransparentColor || valid_color(color);
}

[[nodiscard]] bool valid_font(const font_assets::FontSpec& font) {
  const std::string_view family = font_assets::family_id_view(font.family);
  if (family.empty() ||
      family.size() > font_assets::kMaximumFamilyIdLength ||
      font.size_px == 0 ||
      font.size_px > font_assets::kMaximumFontSizePx) {
    return false;
  }
  for (const char character : family) {
    const bool valid_character =
        (character >= 'a' && character <= 'z') ||
        (character >= '0' && character <= '9') || character == '_' ||
        character == '-';
    if (!valid_character) {
      return false;
    }
  }
  return true;
}

[[nodiscard]] bool valid_placement(const WidgetPlacement& placement,
                                   const std::int32_t display_width,
                                   const std::int32_t display_height) {
  return placement.x >= 0 && placement.y >= 0 && placement.width >= 0 &&
         placement.height >= 0 && placement.x <= display_width &&
         placement.y <= display_height &&
         placement.width <= display_width - placement.x &&
         placement.height <= display_height - placement.y;
}

template <std::size_t Size>
[[nodiscard]] bool terminated(const std::array<char, Size>& value) {
  return std::find(value.begin(), value.end(), '\0') != value.end();
}

[[nodiscard]] bool valid_text_widget(
    const TextWidgetConfiguration& config,
    const std::int32_t display_width, const std::int32_t display_height) {
  const telemetry::TelemetryRegistry registry;
  const std::string_view binding = value_binding_view(config.binding);
  const telemetry::Handle telemetry_handle = registry.resolve(binding);
  if (!telemetry_handle.valid() ||
      config.modifier_count > config.modifiers.size()) {
    return false;
  }
  bool lap_timer_modifier{};
  for (std::size_t index = 0; index < config.modifier_count; ++index) {
    if (config.modifiers[index].type != ValueModifierType::lap_timer ||
        lap_timer_modifier) {
      return false;
    }
    lap_timer_modifier = true;
  }
  if (lap_timer_modifier &&
      (binding != telemetry::fields::kCurrentLapTime ||
       telemetry_handle.type != telemetry::ValueType::uint32)) {
    return false;
  }
  const telemetry::ValueType source_type = telemetry_handle.type;
  const bool compatible_transform =
      config.transform.type == ValueTransformType::none ||
      (config.transform.type == ValueTransformType::time &&
       ((config.transform.time.format ==
             transformers::time_transform::Format::duration_ms &&
         source_type == telemetry::ValueType::uint32) ||
        (config.transform.time.format ==
             transformers::time_transform::Format::signed_duration_ms &&
         source_type == telemetry::ValueType::int32)));
  return compatible_transform &&
         valid_placement(config.placement, display_width, display_height) &&
         valid_font(config.title.font) && valid_font(config.value.font) &&
         valid_color(config.border.color) && valid_color(config.title.color) &&
         valid_color(config.value.color) &&
         valid_optional_color(config.background_color) &&
         config.value.alignment >= TextAlignment::left &&
         config.value.alignment <= TextAlignment::right &&
         config.padding.left <= display_width &&
         config.padding.top <= display_height &&
         config.padding.right <= display_width &&
         config.padding.bottom <= display_height &&
         config.border.width_px <= 240 &&
         config.border.radius_px <= 480 && terminated(config.title.text) &&
         terminated(config.value.unavailable_text) &&
         terminated(config.transform.time.prefix) &&
         terminated(config.transform.time.suffix);
}

}  // namespace

ValidationError validate_configuration(
    const ApplicationConfiguration& configuration,
    const BoardValidationProfile& profile) {
  if (configuration.board.id < BoardId::t_display_s3 ||
      configuration.board.id > BoardId::guition_esp32_4848s040) {
    return ValidationError::invalid_board;
  }
  if (configuration.board.id != profile.board) {
    return ValidationError::board_mismatch;
  }
  if (profile.display.width <= 0 || profile.display.height <= 0 ||
      configuration.hardware.device_count != 0) {
    return ValidationError::invalid_hardware;
  }

  if (configuration.telemetry_transport_present) {
    const TelemetryTransportId transport =
        configuration.telemetry_transport.id;
    if (transport < TelemetryTransportId::board_default ||
        transport > TelemetryTransportId::uart) {
      return ValidationError::invalid_transport;
    }
    const UartTelemetryConfiguration& uart =
        configuration.telemetry_transport.uart;
    if (transport == TelemetryTransportId::native_usb_cdc &&
        !profile.native_usb_cdc_supported) {
      return ValidationError::invalid_transport;
    }
    if (transport == TelemetryTransportId::uart &&
        (uart.port < 0 || uart.port > 2 || uart.tx_pin == uart.rx_pin ||
         uart.baud_rate < 9'600 || uart.baud_rate > 2'000'000 ||
         uart.tx_pin != profile.uart_tx_pin ||
         uart.rx_pin != profile.uart_rx_pin)) {
      return ValidationError::invalid_uart;
    }
  }

  if (configuration.delta_time_present &&
      (configuration.delta_time.scale.range_ms <= 0 ||
       configuration.delta_time.scale.range_ms > 60'000 ||
       !terminated(configuration.delta_time.placeholder) ||
       configuration.delta_time.unavailable_behavior <
           DeltaTimeUnavailableBehavior::hide ||
       configuration.delta_time.unavailable_behavior >
           DeltaTimeUnavailableBehavior::zero)) {
    return ValidationError::invalid_module;
  }

  if (configuration.dashboard.delta_time_present &&
      !configuration.delta_time_present) {
    return ValidationError::invalid_dashboard;
  }

  const std::int32_t display_width = profile.display.width;
  const std::int32_t display_height = profile.display.height;
  if (configuration.dashboard.delta_time_present) {
    const auto& widget = configuration.dashboard.delta_time;
    if (!valid_font(widget.font) ||
        !valid_placement(widget.placement, display_width, display_height) ||
        !valid_color(widget.faster_color) ||
        !valid_color(widget.slower_color) ||
        !valid_color(widget.neutral_color)) {
      return ValidationError::invalid_widget;
    }
  }
  if (configuration.dashboard.text_widget_count >
      configuration.dashboard.text_widgets.size()) {
    return ValidationError::invalid_widget;
  }
  std::size_t lap_timer_modifier_count{};
  for (std::size_t index = 0;
       index < configuration.dashboard.text_widget_count; ++index) {
    if (!valid_text_widget(configuration.dashboard.text_widgets[index],
                           display_width, display_height)) {
      return ValidationError::invalid_widget;
    }
    const auto& text_widget = configuration.dashboard.text_widgets[index];
    for (std::size_t modifier_index = 0;
         modifier_index < text_widget.modifier_count; ++modifier_index) {
      if (text_widget.modifiers[modifier_index].type ==
          ValueModifierType::lap_timer) {
        ++lap_timer_modifier_count;
      }
    }
  }
  if (lap_timer_modifier_count > 1) {
    return ValidationError::invalid_widget;
  }
  return ValidationError::none;
}

const char* validation_error_name(const ValidationError error) {
  switch (error) {
    case ValidationError::none: return "none";
    case ValidationError::malformed: return "malformed";
    case ValidationError::unsupported_schema: return "unsupported_schema";
    case ValidationError::invalid_board: return "invalid_board";
    case ValidationError::board_mismatch: return "board_mismatch";
    case ValidationError::invalid_hardware: return "invalid_hardware";
    case ValidationError::invalid_transport: return "invalid_transport";
    case ValidationError::invalid_uart: return "invalid_uart";
    case ValidationError::invalid_module: return "invalid_module";
    case ValidationError::invalid_dashboard: return "invalid_dashboard";
    case ValidationError::invalid_widget: return "invalid_widget";
  }
  return "unknown";
}

}  // namespace simcore::configuration
