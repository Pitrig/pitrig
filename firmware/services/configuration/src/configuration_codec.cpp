#include "configuration_codec.hpp"

#include <type_traits>

namespace simcore::configuration {
namespace {

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
  writer.integer(region.style.background_color);
  writer.integer(region.style.border_color);
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
  region.style.background_color = reader.integer<std::uint32_t>();
  region.style.border_color = reader.integer<std::uint32_t>();
  region.style.border_width_px = reader.integer<std::uint16_t>();
  region.style.radius_px = reader.integer<std::uint16_t>();
  region.style.visible = reader.boolean();
}

void write_text_widget(Writer& writer,
                       const dashboard::text_widget::Config& config) {
  writer.bytes(config.binding);
  write_placement(writer, config.placement);
  writer.integer(config.padding.left);
  writer.integer(config.padding.top);
  writer.integer(config.padding.right);
  writer.integer(config.padding.bottom);
  writer.integer(config.border.color);
  writer.integer(config.border.width_px);
  writer.integer(config.border.radius_px);
  writer.bytes(config.title.text);
  write_font(writer, config.title.font);
  writer.integer(config.title.color);
  writer.integer(config.title.offset_y_px);
  write_font(writer, config.value.font);
  writer.integer(config.value.color);
  writer.byte(static_cast<std::uint8_t>(config.value.alignment));
  writer.bytes(config.value.unavailable_text);
  writer.integer(config.background_color);
}

void read_text_widget(Reader& reader,
                      dashboard::text_widget::Config& config) {
  reader.bytes(config.binding);
  read_placement(reader, config.placement);
  config.padding.left = reader.integer<std::uint16_t>();
  config.padding.top = reader.integer<std::uint16_t>();
  config.padding.right = reader.integer<std::uint16_t>();
  config.padding.bottom = reader.integer<std::uint16_t>();
  config.border.color = reader.integer<std::uint32_t>();
  config.border.width_px = reader.integer<std::uint16_t>();
  config.border.radius_px = reader.integer<std::uint16_t>();
  reader.bytes(config.title.text);
  read_font(reader, config.title.font);
  config.title.color = reader.integer<std::uint32_t>();
  config.title.offset_y_px = reader.integer<std::int16_t>();
  read_font(reader, config.value.font);
  config.value.color = reader.integer<std::uint32_t>();
  config.value.alignment =
      static_cast<dashboard::text_widget::Alignment>(reader.byte());
  reader.bytes(config.value.unavailable_text);
  config.background_color = reader.integer<std::uint32_t>();
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
  writer.integer(configuration.dashboard.lap_timer.text_color);

  writer.boolean(configuration.dashboard.delta_time.enabled);
  write_font(writer, configuration.dashboard.delta_time.font);
  write_placement(writer, configuration.dashboard.delta_time.placement);
  writer.integer(configuration.dashboard.delta_time.faster_color);
  writer.integer(configuration.dashboard.delta_time.slower_color);
  writer.integer(configuration.dashboard.delta_time.neutral_color);
  writer.integer(
      configuration.dashboard.delta_time.scale.vertical_padding_px);
  writer.integer(configuration.dashboard.delta_time.scale.border_width_px);
  writer.integer(configuration.dashboard.delta_time.scale.border_radius_px);

  writer.byte(configuration.dashboard.text_widget_count);
  for (std::size_t index = 0;
       index < configuration.dashboard.text_widget_count; ++index) {
    write_text_widget(writer, configuration.dashboard.text_widgets[index]);
  }

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
  configuration.delta_time.scale.range_ms =
      reader.integer<std::int32_t>();

  configuration.dashboard.mode =
      static_cast<DashboardMode>(reader.byte());
  const std::uint8_t region_count = reader.byte();
  if (region_count != configuration.dashboard.regions.size()) {
    return {.ok = false, .error = ValidationError::invalid_region};
  }
  for (dashboard::LayoutRegion& region : configuration.dashboard.regions) {
    read_region(reader, region);
  }

  configuration.dashboard.lap_timer.enabled = reader.boolean();
  read_font(reader, configuration.dashboard.lap_timer.font);
  read_placement(reader, configuration.dashboard.lap_timer.placement);
  configuration.dashboard.lap_timer.text_color =
      reader.integer<std::uint32_t>();

  configuration.dashboard.delta_time.enabled = reader.boolean();
  read_font(reader, configuration.dashboard.delta_time.font);
  read_placement(reader, configuration.dashboard.delta_time.placement);
  configuration.dashboard.delta_time.faster_color =
      reader.integer<std::uint32_t>();
  configuration.dashboard.delta_time.slower_color =
      reader.integer<std::uint32_t>();
  configuration.dashboard.delta_time.neutral_color =
      reader.integer<std::uint32_t>();
  configuration.dashboard.delta_time.scale.vertical_padding_px =
      reader.integer<std::uint16_t>();
  configuration.dashboard.delta_time.scale.border_width_px =
      reader.integer<std::uint16_t>();
  configuration.dashboard.delta_time.scale.border_radius_px =
      reader.integer<std::uint16_t>();

  configuration.dashboard.text_widget_count = reader.byte();
  if (configuration.dashboard.text_widget_count >
      configuration.dashboard.text_widgets.size()) {
    return {.ok = false, .error = ValidationError::invalid_widget};
  }
  for (std::size_t index = 0;
       index < configuration.dashboard.text_widget_count; ++index) {
    read_text_widget(reader, configuration.dashboard.text_widgets[index]);
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
