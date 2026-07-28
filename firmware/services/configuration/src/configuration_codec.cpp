#include "configuration_codec.hpp"

#include <algorithm>
#include <array>
#include <cstring>
#include <type_traits>

namespace simcore::configuration {
namespace {

constexpr std::uint16_t kWidgetEnableSchemaVersion = 2;
constexpr std::uint16_t kGearWidgetSchemaVersion = 3;

class Writer {
 public:
  explicit Writer(const std::span<std::uint8_t> output) : output_(output) {}

  template <typename T>
  void integer(const T value) {
    using U = std::make_unsigned_t<T>;
    const U encoded = static_cast<U>(value);
    for (std::size_t index = 0; index < sizeof(T); ++index) {
      byte(static_cast<std::uint8_t>(encoded >> (index * 8U)));
    }
  }

  void byte(const std::uint8_t value) {
    if (position_ >= output_.size()) {
      ok_ = false;
      return;
    }
    output_[position_++] = value;
  }

  void boolean(const bool value) { byte(value ? 1U : 0U); }

  void bytes(const std::span<const char> values) {
    for (const char value : values) {
      byte(static_cast<std::uint8_t>(value));
    }
  }

  [[nodiscard]] bool ok() const { return ok_; }
  [[nodiscard]] std::size_t size() const { return position_; }

 private:
  std::span<std::uint8_t> output_;
  std::size_t position_{};
  bool ok_{true};
};

class Reader {
 public:
  explicit Reader(const std::span<const std::uint8_t> input) : input_(input) {}

  template <typename T>
  T integer() {
    using U = std::make_unsigned_t<T>;
    U decoded{};
    for (std::size_t index = 0; index < sizeof(T); ++index) {
      decoded |= static_cast<U>(byte()) << (index * 8U);
    }
    return static_cast<T>(decoded);
  }

  std::uint8_t byte() {
    if (position_ >= input_.size()) {
      ok_ = false;
      return 0;
    }
    return input_[position_++];
  }

  bool boolean() {
    const std::uint8_t value = byte();
    if (value > 1U) {
      ok_ = false;
    }
    return value != 0;
  }

  void bytes(const std::span<char> destination) {
    for (char& value : destination) {
      value = static_cast<char>(byte());
    }
  }

  [[nodiscard]] bool complete() const {
    return ok_ && position_ == input_.size();
  }

 private:
  std::span<const std::uint8_t> input_;
  std::size_t position_{};
  bool ok_{true};
};

void write_font(Writer& writer, const dashboard::FontSpec& font) {
  writer.byte(static_cast<std::uint8_t>(font.family));
  writer.integer(font.size_px);
}

void read_font(Reader& reader, dashboard::FontSpec& font) {
  font.family = static_cast<dashboard::FontFamily>(reader.byte());
  font.size_px = reader.integer<std::uint16_t>();
}

void write_placement(Writer& writer, const dashboard::Placement& placement) {
  writer.integer(placement.region_id);
  writer.byte(static_cast<std::uint8_t>(placement.anchor));
  writer.integer(placement.offset_x);
  writer.integer(placement.offset_y);
  writer.integer(placement.width);
  writer.integer(placement.height);
}

void read_placement(Reader& reader, dashboard::Placement& placement) {
  placement.region_id = reader.integer<dashboard::RegionId>();
  placement.anchor = static_cast<dashboard::Anchor>(reader.byte());
  placement.offset_x = reader.integer<std::int32_t>();
  placement.offset_y = reader.integer<std::int32_t>();
  placement.width = reader.integer<std::int32_t>();
  placement.height = reader.integer<std::int32_t>();
}

void write_region(Writer& writer, const dashboard::LayoutRegion& region) {
  writer.integer(region.id);
  writer.integer(region.bounds.x);
  writer.integer(region.bounds.y);
  writer.integer(region.bounds.width);
  writer.integer(region.bounds.height);
  writer.integer(region.padding.left);
  writer.integer(region.padding.top);
  writer.integer(region.padding.right);
  writer.integer(region.padding.bottom);
  writer.integer(region.style.background_color_rgb);
  writer.integer(region.style.border_color_rgb);
  writer.integer(region.style.border_width_px);
  writer.integer(region.style.radius_px);
  writer.boolean(region.style.visible);
}

void read_region(Reader& reader, dashboard::LayoutRegion& region) {
  region.id = reader.integer<dashboard::RegionId>();
  region.bounds.x = reader.integer<std::int32_t>();
  region.bounds.y = reader.integer<std::int32_t>();
  region.bounds.width = reader.integer<std::int32_t>();
  region.bounds.height = reader.integer<std::int32_t>();
  region.padding.left = reader.integer<std::uint16_t>();
  region.padding.top = reader.integer<std::uint16_t>();
  region.padding.right = reader.integer<std::uint16_t>();
  region.padding.bottom = reader.integer<std::uint16_t>();
  region.style.background_color_rgb = reader.integer<std::uint32_t>();
  region.style.border_color_rgb = reader.integer<std::uint32_t>();
  region.style.border_width_px = reader.integer<std::uint16_t>();
  region.style.radius_px = reader.integer<std::uint16_t>();
  region.style.visible = reader.boolean();
}

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
      0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
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

CodecResult encode_configuration(
    const ApplicationConfiguration& configuration,
    const std::span<std::uint8_t> output) {
  const ValidationError validation = validate_configuration(configuration);
  if (validation != ValidationError::none) {
    return {.ok = false, .error = validation};
  }

  Writer writer(output);
  writer.integer(kConfigurationSchemaVersion);
  writer.byte(static_cast<std::uint8_t>(configuration.board.id));
  writer.byte(
      static_cast<std::uint8_t>(configuration.telemetry_transport.id));
  writer.integer(static_cast<std::int32_t>(
      configuration.telemetry_transport.uart.port));
  writer.integer(static_cast<std::int32_t>(
      configuration.telemetry_transport.uart.tx_pin));
  writer.integer(static_cast<std::int32_t>(
      configuration.telemetry_transport.uart.rx_pin));
  writer.integer(configuration.telemetry_transport.uart.baud_rate);
  writer.boolean(configuration.telemetry_transport.uart.silence_esp_logs);

  writer.boolean(configuration.lap_timer.telemetry_only);
  writer.integer(configuration.lap_timer.telemetry_timeout_ms);
  writer.byte(
      static_cast<std::uint8_t>(configuration.delta_time.unavailable_behavior));
  writer.bytes(configuration.delta_time.placeholder);
  writer.boolean(configuration.delta_time.scale.enabled);
  writer.boolean(configuration.delta_time.scale.show_sign);
  writer.integer(configuration.delta_time.scale.range_ms);
  writer.byte(static_cast<std::uint8_t>(
      configuration.estimated_lap_time.unavailable_behavior));
  writer.bytes(configuration.estimated_lap_time.placeholder);

  writer.byte(static_cast<std::uint8_t>(configuration.dashboard.mode));
  writer.byte(static_cast<std::uint8_t>(
      configuration.dashboard.regions.size()));
  for (const dashboard::LayoutRegion& region :
       configuration.dashboard.regions) {
    write_region(writer, region);
  }

  writer.boolean(configuration.dashboard.lap_timer.enabled);
  write_font(writer, configuration.dashboard.lap_timer.font);
  write_placement(writer, configuration.dashboard.lap_timer.placement);
  writer.integer(configuration.dashboard.lap_timer.text_color_rgb);

  writer.boolean(configuration.dashboard.delta_time.enabled);
  write_font(writer, configuration.dashboard.delta_time.font);
  write_placement(writer, configuration.dashboard.delta_time.placement);
  writer.integer(configuration.dashboard.delta_time.faster_color_rgb);
  writer.integer(configuration.dashboard.delta_time.slower_color_rgb);
  writer.integer(configuration.dashboard.delta_time.neutral_color_rgb);
  writer.integer(
      configuration.dashboard.delta_time.scale.vertical_padding_px);
  writer.integer(configuration.dashboard.delta_time.scale.border_width_px);
  writer.integer(configuration.dashboard.delta_time.scale.border_radius_px);

  writer.boolean(configuration.dashboard.estimated_lap_time.enabled);
  write_font(writer, configuration.dashboard.estimated_lap_time.font);
  write_placement(writer,
                  configuration.dashboard.estimated_lap_time.placement);
  writer.integer(
      configuration.dashboard.estimated_lap_time.text_color_rgb);

  writer.boolean(configuration.dashboard.gear.enabled);
  write_font(writer, configuration.dashboard.gear.font);
  write_placement(writer, configuration.dashboard.gear.placement);
  writer.integer(configuration.dashboard.gear.padding.left);
  writer.integer(configuration.dashboard.gear.padding.top);
  writer.integer(configuration.dashboard.gear.padding.right);
  writer.integer(configuration.dashboard.gear.padding.bottom);
  writer.integer(configuration.dashboard.gear.border.color_rgb);
  writer.integer(configuration.dashboard.gear.border.width_px);
  writer.integer(configuration.dashboard.gear.border.radius_px);
  writer.integer(configuration.dashboard.gear.text_color_rgb);
  writer.integer(configuration.dashboard.gear.background_color_rgb);

  return {
      .ok = writer.ok(),
      .error =
          writer.ok() ? ValidationError::none : ValidationError::malformed,
      .size = writer.size(),
  };
}

CodecResult decode_configuration(
    const std::span<const std::uint8_t> input,
    ApplicationConfiguration& configuration) {
  Reader reader(input);
  const std::uint16_t schema_version =
      reader.integer<std::uint16_t>();
  if (!is_supported_configuration_schema(schema_version)) {
    return {.ok = false, .error = ValidationError::unsupported_schema};
  }

  configuration = {};
  configuration.board.id = static_cast<BoardId>(reader.byte());
  configuration.telemetry_transport.id =
      static_cast<TelemetryTransportId>(reader.byte());
  configuration.telemetry_transport.uart.port =
      reader.integer<std::int32_t>();
  configuration.telemetry_transport.uart.tx_pin =
      reader.integer<std::int32_t>();
  configuration.telemetry_transport.uart.rx_pin =
      reader.integer<std::int32_t>();
  configuration.telemetry_transport.uart.baud_rate =
      reader.integer<std::uint32_t>();
  configuration.telemetry_transport.uart.silence_esp_logs =
      reader.boolean();

  configuration.lap_timer.telemetry_only = reader.boolean();
  configuration.lap_timer.telemetry_timeout_ms =
      reader.integer<std::uint32_t>();
  configuration.delta_time.unavailable_behavior =
      static_cast<delta_time::UnavailableBehavior>(reader.byte());
  reader.bytes(configuration.delta_time.placeholder);
  configuration.delta_time.scale.enabled = reader.boolean();
  configuration.delta_time.scale.show_sign = reader.boolean();
  configuration.delta_time.scale.range_ms = reader.integer<std::int32_t>();
  configuration.estimated_lap_time.unavailable_behavior =
      static_cast<estimated_lap_time::UnavailableBehavior>(reader.byte());
  reader.bytes(configuration.estimated_lap_time.placeholder);

  configuration.dashboard.mode =
      static_cast<DashboardMode>(reader.byte());
  const std::uint8_t region_count = reader.byte();
  if (region_count != configuration.dashboard.regions.size()) {
    return {.ok = false, .error = ValidationError::invalid_region};
  }
  for (dashboard::LayoutRegion& region : configuration.dashboard.regions) {
    read_region(reader, region);
  }

  configuration.dashboard.lap_timer.enabled =
      schema_version >= kWidgetEnableSchemaVersion ? reader.boolean() : true;
  read_font(reader, configuration.dashboard.lap_timer.font);
  read_placement(reader, configuration.dashboard.lap_timer.placement);
  configuration.dashboard.lap_timer.text_color_rgb =
      reader.integer<std::uint32_t>();

  configuration.dashboard.delta_time.enabled =
      schema_version >= kWidgetEnableSchemaVersion ? reader.boolean() : true;
  read_font(reader, configuration.dashboard.delta_time.font);
  read_placement(reader, configuration.dashboard.delta_time.placement);
  configuration.dashboard.delta_time.faster_color_rgb =
      reader.integer<std::uint32_t>();
  configuration.dashboard.delta_time.slower_color_rgb =
      reader.integer<std::uint32_t>();
  configuration.dashboard.delta_time.neutral_color_rgb =
      reader.integer<std::uint32_t>();
  configuration.dashboard.delta_time.scale.vertical_padding_px =
      reader.integer<std::uint16_t>();
  configuration.dashboard.delta_time.scale.border_width_px =
      reader.integer<std::uint16_t>();
  configuration.dashboard.delta_time.scale.border_radius_px =
      reader.integer<std::uint16_t>();

  configuration.dashboard.estimated_lap_time.enabled =
      schema_version >= kWidgetEnableSchemaVersion ? reader.boolean() : true;
  read_font(reader, configuration.dashboard.estimated_lap_time.font);
  read_placement(reader,
                 configuration.dashboard.estimated_lap_time.placement);
  configuration.dashboard.estimated_lap_time.text_color_rgb =
      reader.integer<std::uint32_t>();

  if (schema_version >= kGearWidgetSchemaVersion) {
    configuration.dashboard.gear.enabled = reader.boolean();
    read_font(reader, configuration.dashboard.gear.font);
    read_placement(reader, configuration.dashboard.gear.placement);
    configuration.dashboard.gear.padding.left =
        reader.integer<std::uint16_t>();
    configuration.dashboard.gear.padding.top =
        reader.integer<std::uint16_t>();
    configuration.dashboard.gear.padding.right =
        reader.integer<std::uint16_t>();
    configuration.dashboard.gear.padding.bottom =
        reader.integer<std::uint16_t>();
    configuration.dashboard.gear.border.color_rgb =
        reader.integer<std::uint32_t>();
    configuration.dashboard.gear.border.width_px =
        reader.integer<std::uint16_t>();
    configuration.dashboard.gear.border.radius_px =
        reader.integer<std::uint16_t>();
    configuration.dashboard.gear.text_color_rgb =
        reader.integer<std::uint32_t>();
    configuration.dashboard.gear.background_color_rgb =
        reader.integer<std::uint32_t>();
  } else {
    configuration.dashboard.gear.enabled =
        configuration.board.id == BoardId::guition_esp32_4848s040;
  }

  if (!reader.complete()) {
    return {.ok = false, .error = ValidationError::malformed};
  }
  const ValidationError validation = validate_configuration(configuration);
  return {
      .ok = validation == ValidationError::none,
      .error = validation,
      .size = input.size(),
  };
}

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
  if (!valid_font(lap.font) || !valid_font(delta.font) ||
      !valid_font(estimated.font) || !valid_font(gear.font) ||
      !valid_placement(lap.placement, region.id) ||
      !valid_placement(delta.placement, region.id) ||
      !valid_placement(estimated.placement, region.id) ||
      !valid_placement(gear.placement, region.id) ||
      !valid_color(lap.text_color_rgb) ||
      !valid_color(delta.faster_color_rgb) ||
      !valid_color(delta.slower_color_rgb) ||
      !valid_color(delta.neutral_color_rgb) ||
      !valid_color(estimated.text_color_rgb) ||
      !valid_color(gear.border.color_rgb) ||
      !valid_color(gear.text_color_rgb) ||
      !valid_color(gear.background_color_rgb) ||
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
