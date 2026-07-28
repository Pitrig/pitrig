#include "configuration_codec.hpp"

#include <type_traits>

namespace simcore::configuration {
namespace {

constexpr std::uint16_t kWidgetEnableSchemaVersion = 2;
constexpr std::uint16_t kGearWidgetSchemaVersion = 3;
constexpr std::uint16_t kSpeedWidgetSchemaVersion = 4;
constexpr std::uint16_t kDrivingAidWidgetsSchemaVersion = 5;
constexpr std::uint16_t kDrivingAidLabelOffsetSchemaVersion = 6;
constexpr std::uint16_t kRpmWidgetSchemaVersion = 7;
constexpr std::uint16_t kFuelWidgetsSchemaVersion = 8;
constexpr std::uint16_t kFuelWithoutIconSchemaVersion = 9;

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

void write_driving_aid_widget(
    Writer& writer, const dashboard::driving_aid_widget::Config& config) {
  writer.boolean(config.enabled);
  write_font(writer, config.label_font);
  write_font(writer, config.value_font);
  write_placement(writer, config.placement);
  writer.integer(config.padding.left);
  writer.integer(config.padding.top);
  writer.integer(config.padding.right);
  writer.integer(config.padding.bottom);
  writer.integer(config.border.color_rgb);
  writer.integer(config.border.width_px);
  writer.integer(config.border.radius_px);
  writer.integer(config.label_color_rgb);
  writer.integer(config.value_color_rgb);
  writer.integer(config.background_color_rgb);
  writer.integer(config.label_offset_y_px);
}

void read_driving_aid_widget(
    Reader& reader, dashboard::driving_aid_widget::Config& config,
    const bool has_label_offset) {
  config.enabled = reader.boolean();
  read_font(reader, config.label_font);
  read_font(reader, config.value_font);
  read_placement(reader, config.placement);
  config.padding.left = reader.integer<std::uint16_t>();
  config.padding.top = reader.integer<std::uint16_t>();
  config.padding.right = reader.integer<std::uint16_t>();
  config.padding.bottom = reader.integer<std::uint16_t>();
  config.border.color_rgb = reader.integer<std::uint32_t>();
  config.border.width_px = reader.integer<std::uint16_t>();
  config.border.radius_px = reader.integer<std::uint16_t>();
  config.label_color_rgb = reader.integer<std::uint32_t>();
  config.value_color_rgb = reader.integer<std::uint32_t>();
  config.background_color_rgb = reader.integer<std::uint32_t>();
  config.label_offset_y_px =
      has_label_offset ? reader.integer<std::int16_t>() : 0;
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

  writer.boolean(configuration.dashboard.speed.enabled);
  write_font(writer, configuration.dashboard.speed.font);
  write_placement(writer, configuration.dashboard.speed.placement);
  writer.integer(configuration.dashboard.speed.text_color_rgb);

  write_driving_aid_widget(
      writer, configuration.dashboard.traction_control);
  write_driving_aid_widget(writer, configuration.dashboard.abs);
  write_driving_aid_widget(writer, configuration.dashboard.brake_bias);

  writer.boolean(configuration.dashboard.rpm.enabled);
  write_font(writer, configuration.dashboard.rpm.font);
  write_placement(writer, configuration.dashboard.rpm.placement);
  writer.integer(configuration.dashboard.rpm.text_color_rgb);

  writer.boolean(configuration.dashboard.fuel.enabled);
  write_font(writer, configuration.dashboard.fuel.font);
  write_placement(writer, configuration.dashboard.fuel.placement);
  writer.integer(configuration.dashboard.fuel.text_color_rgb);

  writer.boolean(configuration.dashboard.fuel_average.enabled);
  write_font(writer, configuration.dashboard.fuel_average.font);
  write_placement(writer, configuration.dashboard.fuel_average.placement);
  writer.integer(configuration.dashboard.fuel_average.text_color_rgb);

  writer.boolean(configuration.dashboard.fuel_laps_remaining.enabled);
  write_font(writer, configuration.dashboard.fuel_laps_remaining.font);
  write_placement(
      writer, configuration.dashboard.fuel_laps_remaining.placement);
  writer.integer(
      configuration.dashboard.fuel_laps_remaining.text_color_rgb);

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

  if (schema_version >= kSpeedWidgetSchemaVersion) {
    configuration.dashboard.speed.enabled = reader.boolean();
    read_font(reader, configuration.dashboard.speed.font);
    read_placement(reader, configuration.dashboard.speed.placement);
    configuration.dashboard.speed.text_color_rgb =
        reader.integer<std::uint32_t>();
  } else {
    configuration.dashboard.speed.enabled =
        configuration.board.id == BoardId::guition_esp32_4848s040;
  }

  if (schema_version >= kDrivingAidWidgetsSchemaVersion) {
    const bool has_label_offset =
        schema_version >= kDrivingAidLabelOffsetSchemaVersion;
    read_driving_aid_widget(
        reader, configuration.dashboard.traction_control, has_label_offset);
    read_driving_aid_widget(
        reader, configuration.dashboard.abs, has_label_offset);
    read_driving_aid_widget(
        reader, configuration.dashboard.brake_bias, has_label_offset);
  } else {
    configuration.dashboard.traction_control.enabled = false;
    configuration.dashboard.abs.enabled = false;
    configuration.dashboard.brake_bias.enabled = false;
  }

  if (schema_version >= kRpmWidgetSchemaVersion) {
    configuration.dashboard.rpm.enabled = reader.boolean();
    read_font(reader, configuration.dashboard.rpm.font);
    read_placement(reader, configuration.dashboard.rpm.placement);
    configuration.dashboard.rpm.text_color_rgb =
        reader.integer<std::uint32_t>();
  } else {
    configuration.dashboard.rpm.enabled = false;
  }

  if (schema_version >= kFuelWidgetsSchemaVersion) {
    configuration.dashboard.fuel.enabled = reader.boolean();
    read_font(reader, configuration.dashboard.fuel.font);
    read_placement(reader, configuration.dashboard.fuel.placement);
    configuration.dashboard.fuel.text_color_rgb =
        reader.integer<std::uint32_t>();
    if (schema_version < kFuelWithoutIconSchemaVersion) {
      static_cast<void>(reader.integer<std::uint32_t>());
    }

    configuration.dashboard.fuel_average.enabled = reader.boolean();
    read_font(reader, configuration.dashboard.fuel_average.font);
    read_placement(reader, configuration.dashboard.fuel_average.placement);
    configuration.dashboard.fuel_average.text_color_rgb =
        reader.integer<std::uint32_t>();

    configuration.dashboard.fuel_laps_remaining.enabled = reader.boolean();
    read_font(reader, configuration.dashboard.fuel_laps_remaining.font);
    read_placement(
        reader, configuration.dashboard.fuel_laps_remaining.placement);
    configuration.dashboard.fuel_laps_remaining.text_color_rgb =
        reader.integer<std::uint32_t>();
  } else {
    configuration.dashboard.fuel.enabled = false;
    configuration.dashboard.fuel_average.enabled = false;
    configuration.dashboard.fuel_laps_remaining.enabled = false;
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

}  // namespace simcore::configuration
