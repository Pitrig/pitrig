#include "configuration_codec.hpp"

#include <algorithm>
#include <array>

namespace simcore::configuration {
namespace {

bool valid_color(const std::uint32_t color) { return color <= 0xFFFFFFU; }

bool valid_font(const dashboard::FontSpec& font) {
  if (font.family == dashboard::FontFamily::montserrat) {
    return font.size_px == 10 || font.size_px == 48;
  }
  if (font.family == dashboard::FontFamily::roboto_mono) {
    return font.size_px == 43;
  }
  if (font.family != dashboard::FontFamily::lcd) {
    return false;
  }
  return font.size_px == 39 || font.size_px == 43 ||
         font.size_px == 47 || font.size_px == 53;
}

bool valid_placement(const dashboard::Placement& placement,
                     const dashboard::RegionId region_id) {
  return placement.region_id == dashboard::kScreenRegionId ||
         placement.region_id == region_id;
}

template <std::size_t N>
bool contains_pin(const std::array<int, N>& pins, const int pin) {
  return std::find(pins.begin(), pins.end(), pin) != pins.end();
}

bool uart_pins_available(const BoardId board, const int tx_pin,
                         const int rx_pin) {
  constexpr std::array<int, 15> kTDisplayPins{
      5, 6, 7, 8, 9, 15, 38, 39, 40, 41, 42, 45, 46, 47, 48};
  constexpr std::array<int, 24> kGuitionPins{
      0,  3,  4,  5,  6,  7,  8,  9,  10, 11, 12, 13,
      14, 15, 16, 17, 18, 20, 21, 38, 39, 46, 47, 48};
  const bool tx_reserved =
      board == BoardId::t_display_s3
          ? contains_pin(kTDisplayPins, tx_pin)
          : contains_pin(kGuitionPins, tx_pin);
  const bool rx_reserved =
      board == BoardId::t_display_s3
          ? contains_pin(kTDisplayPins, rx_pin)
          : contains_pin(kGuitionPins, rx_pin);
  return !tx_reserved && !rx_reserved;
}

}  // namespace

ValidationError validate_configuration(
    const ApplicationConfiguration& configuration) {
  if (configuration.board.id != BoardId::t_display_s3 &&
      configuration.board.id != BoardId::guition_esp32_4848s040) {
    return ValidationError::invalid_board;
  }

  const TelemetryTransportId transport = configuration.telemetry_transport.id;
  if (transport != TelemetryTransportId::board_default &&
      transport != TelemetryTransportId::native_usb_cdc &&
      transport != TelemetryTransportId::uart) {
    return ValidationError::invalid_transport;
  }
  if (configuration.board.id == BoardId::guition_esp32_4848s040 &&
      transport == TelemetryTransportId::native_usb_cdc) {
    return ValidationError::invalid_transport;
  }
  const auto& uart = configuration.telemetry_transport.uart;
  if (uart.port < 0 || uart.port > 2 || uart.tx_pin < 0 || uart.tx_pin > 48 ||
      uart.rx_pin < 0 || uart.rx_pin > 48 || uart.tx_pin == uart.rx_pin ||
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
      std::find(configuration.delta_time.placeholder.begin(),
                configuration.delta_time.placeholder.end(), '\0') ==
          configuration.delta_time.placeholder.end() ||
      std::find(configuration.estimated_lap_time.placeholder.begin(),
                configuration.estimated_lap_time.placeholder.end(), '\0') ==
          configuration.estimated_lap_time.placeholder.end()) {
    return ValidationError::invalid_module;
  }
  if (configuration.delta_time.unavailable_behavior <
          delta_time::UnavailableBehavior::hide ||
      configuration.delta_time.unavailable_behavior >
          delta_time::UnavailableBehavior::zero ||
      configuration.estimated_lap_time.unavailable_behavior <
          estimated_lap_time::UnavailableBehavior::hide ||
      configuration.estimated_lap_time.unavailable_behavior >
          estimated_lap_time::UnavailableBehavior::placeholder) {
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
      !valid_color(region.style.background_color_rgb) ||
      !valid_color(region.style.border_color_rgb)) {
    return ValidationError::invalid_region;
  }

  const auto& lap = configuration.dashboard.lap_timer;
  const auto& delta = configuration.dashboard.delta_time;
  const auto& estimated = configuration.dashboard.estimated_lap_time;
  const auto& gear = configuration.dashboard.gear;
  const auto& speed = configuration.dashboard.speed;
  if (!valid_font(lap.font) || !valid_font(delta.font) ||
      !valid_font(estimated.font) || !valid_font(gear.font) ||
      !valid_font(speed.font) ||
      !valid_placement(lap.placement, region.id) ||
      !valid_placement(delta.placement, region.id) ||
      !valid_placement(estimated.placement, region.id) ||
      !valid_placement(gear.placement, region.id) ||
      !valid_placement(speed.placement, region.id) ||
      !valid_color(lap.text_color_rgb) ||
      !valid_color(delta.faster_color_rgb) ||
      !valid_color(delta.slower_color_rgb) ||
      !valid_color(delta.neutral_color_rgb) ||
      !valid_color(estimated.text_color_rgb) ||
      !valid_color(gear.border.color_rgb) ||
      !valid_color(gear.text_color_rgb) ||
      !valid_color(gear.background_color_rgb) ||
      !valid_color(speed.text_color_rgb) ||
      gear.padding.left > 480 || gear.padding.top > 480 ||
      gear.padding.right > 480 || gear.padding.bottom > 480 ||
      gear.border.width_px > 240 || gear.border.radius_px > 480 ||
      (configuration.board.id == BoardId::t_display_s3 && gear.enabled)) {
    return ValidationError::invalid_widget;
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
