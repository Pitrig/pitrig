#include "configuration_json.hpp"

#include <algorithm>

namespace simcore::configuration {
namespace {

[[nodiscard]] bool valid_color(const std::uint32_t color) {
  return color <= 0x00FF'FFFFU;
}

[[nodiscard]] bool valid_optional_color(const std::uint32_t color) {
  return color == dashboard::kTransparentColor || valid_color(color);
}

[[nodiscard]] bool valid_font(const dashboard::FontSpec& font) {
  if (font.family == dashboard::FontFamily::montserrat) {
    return font.size_px == 10 || font.size_px == 24 || font.size_px == 48;
  }
  if (font.family == dashboard::FontFamily::lcd) {
    return font.size_px == 39 || font.size_px == 43 ||
           font.size_px == 47 || font.size_px == 53;
  }
  return font.family == dashboard::FontFamily::roboto_mono &&
         font.size_px == 43;
}

[[nodiscard]] bool valid_placement(const dashboard::Placement& placement,
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
    const dashboard::text_widget::Config& config,
    const std::int32_t display_width, const std::int32_t display_height) {
  const telemetry::TelemetryRegistry registry;
  return registry.resolve(telemetry::field_name_view(config.binding)).valid() &&
         valid_placement(config.placement, display_width, display_height) &&
         valid_font(config.title.font) && valid_font(config.value.font) &&
         valid_color(config.border.color) && valid_color(config.title.color) &&
         valid_color(config.value.color) &&
         valid_optional_color(config.background_color) &&
         config.value.alignment >= dashboard::text_widget::Alignment::left &&
         config.value.alignment <= dashboard::text_widget::Alignment::right &&
         config.padding.left <= display_width &&
         config.padding.top <= display_height &&
         config.padding.right <= display_width &&
         config.padding.bottom <= display_height &&
         config.border.width_px <= 240 &&
         config.border.radius_px <= 480 && terminated(config.title.text) &&
         terminated(config.value.unavailable_text);
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

  if (configuration.lap_timer_present &&
      (configuration.lap_timer.telemetry_timeout_ms == 0 ||
       configuration.lap_timer.telemetry_timeout_ms > 60'000)) {
    return ValidationError::invalid_module;
  }
  if (configuration.delta_time_present &&
      (configuration.delta_time.scale.range_ms <= 0 ||
       configuration.delta_time.scale.range_ms > 60'000 ||
       !terminated(configuration.delta_time.placeholder) ||
       configuration.delta_time.unavailable_behavior <
           delta_time::UnavailableBehavior::hide ||
       configuration.delta_time.unavailable_behavior >
           delta_time::UnavailableBehavior::zero)) {
    return ValidationError::invalid_module;
  }

  if ((configuration.dashboard.lap_timer_present &&
       !configuration.lap_timer_present) ||
      (configuration.dashboard.delta_time_present &&
       !configuration.delta_time_present)) {
    return ValidationError::invalid_dashboard;
  }

  const std::int32_t display_width = profile.display.width;
  const std::int32_t display_height = profile.display.height;
  if (configuration.dashboard.lap_timer_present) {
    const auto& widget = configuration.dashboard.lap_timer;
    if (!valid_font(widget.font) ||
        !valid_placement(widget.placement, display_width, display_height) ||
        !valid_color(widget.text_color)) {
      return ValidationError::invalid_widget;
    }
  }
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
  for (std::size_t index = 0;
       index < configuration.dashboard.text_widget_count; ++index) {
    if (!valid_text_widget(configuration.dashboard.text_widgets[index],
                           display_width, display_height)) {
      return ValidationError::invalid_widget;
    }
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
