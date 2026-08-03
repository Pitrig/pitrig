#include "configuration_codec.hpp"

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
    return font.size_px == 10 || font.size_px == 24 ||
           font.size_px == 48;
  }
  if (font.family == dashboard::FontFamily::lcd) {
    return font.size_px == 39 || font.size_px == 43 ||
           font.size_px == 47 || font.size_px == 53;
  }
  return font.family == dashboard::FontFamily::roboto_mono &&
         font.size_px == 43;
}

[[nodiscard]] bool valid_placement(
    const dashboard::Placement& placement,
    const dashboard::RegionId configured_region) {
  return (placement.region_id == dashboard::kScreenRegionId ||
          placement.region_id == configured_region) &&
         placement.anchor >= dashboard::Anchor::top_left &&
         placement.anchor <= dashboard::Anchor::bottom_right &&
         placement.width >= 0 && placement.height >= 0 &&
         placement.width <= 480 && placement.height <= 480;
}

template <std::size_t Size>
[[nodiscard]] bool terminated(const std::array<char, Size>& text) {
  return std::find(text.begin(), text.end(), '\0') != text.end();
}

[[nodiscard]] bool valid_text_widget(
    const dashboard::text_widget::Config& config,
    const dashboard::RegionId configured_region) {
  const telemetry::TelemetryRegistry registry;
  return registry.resolve(telemetry::field_name_view(config.binding)).valid() &&
         valid_placement(config.placement, configured_region) &&
         valid_font(config.title.font) && valid_font(config.value.font) &&
         valid_color(config.border.color) &&
         valid_color(config.title.color) &&
         valid_color(config.value.color) &&
         valid_optional_color(config.background_color) &&
         config.value.alignment >= dashboard::text_widget::Alignment::left &&
         config.value.alignment <= dashboard::text_widget::Alignment::right &&
         config.padding.left <= 480 && config.padding.top <= 480 &&
         config.padding.right <= 480 && config.padding.bottom <= 480 &&
         config.border.width_px <= 240 && config.border.radius_px <= 480 &&
         terminated(config.title.text) &&
         terminated(config.value.unavailable_text);
}

[[nodiscard]] bool uart_pins_available(const BoardId board,
                                       const int tx_pin,
                                       const int rx_pin) {
  if (board == BoardId::guition_esp32_4848s040) {
    return tx_pin == 43 && rx_pin == 44;
  }
  return tx_pin >= -1 && tx_pin <= 48 && rx_pin >= -1 && rx_pin <= 48;
}

}  // namespace

ValidationError validate_configuration(
    const ApplicationConfiguration& configuration) {
  if (configuration.board.id < BoardId::t_display_s3 ||
      configuration.board.id > BoardId::guition_esp32_4848s040) {
    return ValidationError::invalid_board;
  }

  const TelemetryTransportId transport =
      configuration.telemetry_transport.id;
  if (transport < TelemetryTransportId::board_default ||
      transport > TelemetryTransportId::uart) {
    return ValidationError::invalid_transport;
  }
  const UartTelemetryConfiguration& uart =
      configuration.telemetry_transport.uart;
  if (uart.port < 0 || uart.port > 2 || uart.tx_pin == uart.rx_pin ||
      uart.baud_rate < 9'600 || uart.baud_rate > 2'000'000) {
    return ValidationError::invalid_uart;
  }
  const bool uses_uart =
      transport == TelemetryTransportId::uart ||
      (transport == TelemetryTransportId::board_default &&
       configuration.board.id == BoardId::guition_esp32_4848s040);
  if (uses_uart &&
      !uart_pins_available(configuration.board.id, uart.tx_pin, uart.rx_pin)) {
    return ValidationError::invalid_uart;
  }

  if (configuration.lap_timer.telemetry_timeout_ms == 0 ||
      configuration.lap_timer.telemetry_timeout_ms > 60'000 ||
      configuration.delta_time.scale.range_ms <= 0 ||
      configuration.delta_time.scale.range_ms > 60'000 ||
      !terminated(configuration.delta_time.placeholder)) {
    return ValidationError::invalid_module;
  }
  if (configuration.delta_time.unavailable_behavior <
          delta_time::UnavailableBehavior::hide ||
      configuration.delta_time.unavailable_behavior >
          delta_time::UnavailableBehavior::zero) {
    return ValidationError::invalid_module;
  }

  if (configuration.dashboard.mode != DashboardMode::normal
#if SIMCORE_DISPLAY_DIAGNOSTICS
      && configuration.dashboard.mode != DashboardMode::display_diagnostics
#endif
  ) {
    return ValidationError::invalid_dashboard;
  }

  const std::int32_t display_width =
      configuration.board.id == BoardId::t_display_s3 ? 320 : 480;
  const std::int32_t display_height =
      configuration.board.id == BoardId::t_display_s3 ? 170 : 480;
  const dashboard::LayoutRegion& region =
      configuration.dashboard.regions.front();
  if (region.id == dashboard::kScreenRegionId || region.bounds.x < 0 ||
      region.bounds.y < 0 || region.bounds.width <= 0 ||
      region.bounds.height <= 0 ||
      region.bounds.x + region.bounds.width > display_width ||
      region.bounds.y + region.bounds.height > display_height ||
      static_cast<std::uint32_t>(region.padding.left) +
              region.padding.right >=
          static_cast<std::uint32_t>(region.bounds.width) ||
      static_cast<std::uint32_t>(region.padding.top) +
              region.padding.bottom >=
          static_cast<std::uint32_t>(region.bounds.height) ||
      !valid_color(region.style.background_color) ||
      !valid_color(region.style.border_color)) {
    return ValidationError::invalid_region;
  }

  const auto& lap = configuration.dashboard.lap_timer;
  const auto& delta = configuration.dashboard.delta_time;
  if (!valid_font(lap.font) || !valid_font(delta.font) ||
      !valid_placement(lap.placement, region.id) ||
      !valid_placement(delta.placement, region.id) ||
      !valid_color(lap.text_color) ||
      !valid_color(delta.faster_color) ||
      !valid_color(delta.slower_color) ||
      !valid_color(delta.neutral_color) ||
      configuration.dashboard.text_widget_count >
          configuration.dashboard.text_widgets.size()) {
    return ValidationError::invalid_widget;
  }

  for (std::size_t index = 0;
       index < configuration.dashboard.text_widget_count; ++index) {
    if (!valid_text_widget(configuration.dashboard.text_widgets[index],
                           region.id)) {
      return ValidationError::invalid_widget;
    }
  }

  return ValidationError::none;
}

const char* validation_error_name(const ValidationError error) {
  switch (error) {
    case ValidationError::none:
      return "none";
    case ValidationError::malformed:
      return "malformed";
    case ValidationError::unsupported_schema:
      return "unsupported_schema";
    case ValidationError::invalid_board:
      return "invalid_board";
    case ValidationError::board_mismatch:
      return "board_mismatch";
    case ValidationError::invalid_transport:
      return "invalid_transport";
    case ValidationError::invalid_uart:
      return "invalid_uart";
    case ValidationError::invalid_module:
      return "invalid_module";
    case ValidationError::invalid_dashboard:
      return "invalid_dashboard";
    case ValidationError::invalid_region:
      return "invalid_region";
    case ValidationError::invalid_widget:
      return "invalid_widget";
  }
  return "unknown";
}

}  // namespace simcore::configuration
