#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <string_view>

#include "configuration_json.hpp"
#include "telemetry_registry.hpp"

namespace simcore::configuration {
namespace {

// Records a rejection with the property that caused it. The first cause wins so
// an inner reason is not replaced by the generic error its caller would return.
bool reject(ValidationFailure& failure, const ValidationError error,
            const std::string_view path) {
  if (!failure.ok()) {
    return false;
  }
  failure.error = error;
  std::size_t length = 0;
  for (const char character : path) {
    if (length + 1 >= failure.path.size()) {
      break;
    }
    failure.path[length++] = character;
  }
  return false;
}

[[nodiscard]] bool valid_color(const std::uint32_t color) {
  return color <= 0x00FF'FFFFU;
}

[[nodiscard]] bool valid_optional_color(const std::uint32_t color) {
  return color == kTransparentColor || valid_color(color);
}

// A transform must be able to read the value it is placed on. Each time format
// accepts exactly one millisecond type. The number transform accepts anything
// numeric, including a source that carries its number as text, and is bounded
// by what the fixed-point conversion can render.
[[nodiscard]] bool valid_transform(const ValueTransform& transform,
                                   const telemetry::ValueType type) {
  using transformers::time_transform::Format;
  switch (transform.type) {
    case ValueTransformType::none:
      return true;
    case ValueTransformType::time:
      return (transform.time.format == Format::duration_ms &&
              type == telemetry::ValueType::uint32) ||
             (transform.time.format == Format::signed_duration_ms &&
              type == telemetry::ValueType::int32);
    case ValueTransformType::number:
      return type != telemetry::ValueType::boolean &&
             transform.number.decimals <=
                 transformers::number_transform::kMaximumDecimals &&
             std::isfinite(transform.number.scale) &&
             std::isfinite(transform.number.offset);
  }
  return false;
}

[[nodiscard]] bool valid_font(const font_assets::FontSpec& font) {
  return font_assets::valid_family_id(font.family) && font.size_px != 0 &&
         font.size_px <= font_assets::kMaximumFontSizePx;
}

// An uploaded package carries one face per family, so a document may not name
// more families than a package can hold. Sizes are free: every one of them is
// rasterized from the same face.
[[nodiscard]] bool within_family_budget(
    const ApplicationConfiguration& configuration) {
  std::array<font_assets::FamilyId, font_assets::kMaximumFamilies> families{};
  std::size_t count{};
  const auto record = [&families, &count](const font_assets::FontSpec& font) {
    for (std::size_t index = 0; index < count; ++index) {
      if (families[index] == font.family) {
        return true;
      }
    }
    if (count == families.size()) {
      return false;
    }
    families[count] = font.family;
    ++count;
    return true;
  };

  const DashboardConfiguration& dashboard = configuration.dashboard;
  for (std::size_t screen_index = 0; screen_index < dashboard.screen_count;
       ++screen_index) {
    const ScreenConfiguration& screen = dashboard.screens[screen_index];
    for (std::size_t index = 0; index < screen.text_widget_count; ++index) {
      const TextWidgetConfiguration& widget = screen.text_widgets[index];
      if (!record(widget.value.font)) {
        return false;
      }
      if (widget.title.text.front() != '\0' && !record(widget.title.font)) {
        return false;
      }
    }
    for (std::size_t index = 0; index < screen.delta_time_widget_count;
         ++index) {
      if (!record(screen.delta_time_widgets[index].font)) {
        return false;
      }
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

// Owns the one immutable telemetry registry every widget resolves against. It
// used to be constructed per widget on the validating task's stack.
class Validator final {
 public:
  Validator(const ValidationContext& profile, ValidationFailure& failure)
      : profile_(profile), failure_(failure) {}

  [[nodiscard]] bool text_widget(const TextWidgetConfiguration& config);
  [[nodiscard]] bool delta_time_widget(
      const DeltaTimeWidgetConfiguration& config);

 private:
  [[nodiscard]] std::int32_t width() const { return profile_.display.width; }
  [[nodiscard]] std::int32_t height() const { return profile_.display.height; }

  const telemetry::TelemetryRegistry registry_{};
  const ValidationContext& profile_;
  ValidationFailure& failure_;
};

bool Validator::delta_time_widget(const DeltaTimeWidgetConfiguration& config) {
  if (!valid_font(config.font)) {
    return reject(failure_, ValidationError::invalid_widget, "font");
  }
  if (!valid_placement(config.placement, width(), height())) {
    return reject(failure_, ValidationError::invalid_widget, "placement");
  }
  if (!valid_color(config.faster_color)) {
    return reject(failure_, ValidationError::invalid_widget, "faster_color");
  }
  if (!valid_color(config.slower_color)) {
    return reject(failure_, ValidationError::invalid_widget, "slower_color");
  }
  if (!valid_color(config.neutral_color)) {
    return reject(failure_, ValidationError::invalid_widget, "neutral_color");
  }
  if (!terminated(config.id)) {
    return reject(failure_, ValidationError::invalid_widget, "id");
  }
  return true;
}

bool Validator::text_widget(const TextWidgetConfiguration& config) {
  const std::string_view binding = value_binding_view(config.binding);
  const telemetry::Handle handle = registry_.resolve(binding);
  if (!handle.valid()) {
    return reject(failure_, ValidationError::invalid_widget, "binding");
  }
  if (config.modifier_count > config.modifiers.size()) {
    return reject(failure_, ValidationError::invalid_widget, "modifiers");
  }

  bool lap_timer_modifier{};
  for (std::size_t index = 0; index < config.modifier_count; ++index) {
    if (config.modifiers[index].type != ValueModifierType::lap_timer ||
        lap_timer_modifier) {
      return reject(failure_, ValidationError::invalid_widget, "modifiers");
    }
    lap_timer_modifier = true;
  }
  if (lap_timer_modifier &&
      (binding != telemetry::fields::kCurrentLapTime ||
       handle.type != telemetry::ValueType::uint32)) {
    return reject(failure_, ValidationError::invalid_widget, "modifiers");
  }

  if (!valid_transform(config.transform, handle.type)) {
    return reject(failure_, ValidationError::invalid_widget, "transform");
  }
  if (!terminated(config.transform.prefix) ||
      !terminated(config.transform.suffix)) {
    return reject(failure_, ValidationError::invalid_widget, "transform");
  }
  if (!valid_placement(config.placement, width(), height())) {
    return reject(failure_, ValidationError::invalid_widget, "placement");
  }
  if (config.padding.left > width() || config.padding.right > width() ||
      config.padding.top > height() || config.padding.bottom > height()) {
    return reject(failure_, ValidationError::invalid_widget, "padding");
  }
  if (!valid_color(config.border.color) || config.border.width_px > 240 ||
      config.border.radius_px > 480) {
    return reject(failure_, ValidationError::invalid_widget, "border");
  }
  if (!terminated(config.title.text) || !valid_color(config.title.color) ||
      (config.title.text.front() != '\0' && !valid_font(config.title.font))) {
    return reject(failure_, ValidationError::invalid_widget, "title");
  }
  if (!valid_font(config.value.font) || !valid_color(config.value.color) ||
      !terminated(config.value.unavailable_text) ||
      config.value.alignment < TextAlignment::left ||
      config.value.alignment > TextAlignment::right) {
    return reject(failure_, ValidationError::invalid_widget, "value");
  }
  if (!valid_optional_color(config.background_color)) {
    return reject(failure_, ValidationError::invalid_widget,
                  "background_color");
  }
  if (!terminated(config.id)) {
    return reject(failure_, ValidationError::invalid_widget, "id");
  }
  return true;
}

[[nodiscard]] bool validate_transport(
    const ApplicationConfiguration& configuration,
    const ValidationContext& profile, ValidationFailure& failure) {
  if (!configuration.telemetry_transport_present) {
    return true;
  }
  const TelemetryTransportId transport = configuration.telemetry_transport.id;
  if (transport < TelemetryTransportId::board_default ||
      transport > TelemetryTransportId::uart) {
    return reject(failure, ValidationError::invalid_transport,
                  "telemetry_transport.id");
  }
  if (transport == TelemetryTransportId::native_usb_cdc &&
      !profile.native_usb_cdc_supported) {
    return reject(failure, ValidationError::invalid_transport,
                  "telemetry_transport.id");
  }
  const UartTelemetryConfiguration& uart = configuration.telemetry_transport.uart;
  if (transport == TelemetryTransportId::uart &&
      (!profile.uart_supported || uart.port < 0 || uart.port > 2 ||
       uart.tx_pin == uart.rx_pin || uart.baud_rate < 9'600 ||
       uart.baud_rate > 2'000'000 || uart.tx_pin != profile.uart_tx_pin ||
       uart.rx_pin != profile.uart_rx_pin)) {
    return reject(failure, ValidationError::invalid_uart,
                  "telemetry_transport.uart");
  }
  return true;
}

}  // namespace

ValidationFailure validate_configuration(
    const ApplicationConfiguration& configuration,
    const ValidationContext& profile) {
  ValidationFailure failure{};

  if (configuration.board.id < BoardId::t_display_s3 ||
      configuration.board.id > BoardId::guition_jc1060p470c) {
    (void)reject(failure, ValidationError::invalid_board, "board");
    return failure;
  }
  if (configuration.board.id != profile.board) {
    (void)reject(failure, ValidationError::board_mismatch, "board");
    return failure;
  }
  if (profile.display.width <= 0 || profile.display.height <= 0 ||
      configuration.hardware.device_count != 0) {
    (void)reject(failure, ValidationError::invalid_hardware, "hardware");
    return failure;
  }
  if (!validate_transport(configuration, profile, failure)) {
    return failure;
  }

  if (configuration.delta_time_present &&
      (configuration.delta_time.scale.range_ms <= 0 ||
       configuration.delta_time.scale.range_ms > 60'000 ||
       !terminated(configuration.delta_time.placeholder) ||
       configuration.delta_time.unavailable_behavior <
           DeltaTimeUnavailableBehavior::hide ||
       configuration.delta_time.unavailable_behavior >
           DeltaTimeUnavailableBehavior::zero)) {
    (void)reject(failure, ValidationError::invalid_module, "delta_time");
    return failure;
  }

  const DashboardConfiguration& dashboard = configuration.dashboard;
  if (dashboard.screen_count > dashboard.screens.size()) {
    (void)reject(failure, ValidationError::invalid_screen, "dashboard.screens");
    return failure;
  }

  Validator validator(profile, failure);
  std::size_t lap_timer_modifier_count{};

  for (std::size_t screen_index = 0; screen_index < dashboard.screen_count;
       ++screen_index) {
    const ScreenConfiguration& screen = dashboard.screens[screen_index];
    if (!valid_color(screen.background_color) || !terminated(screen.id)) {
      (void)reject(failure, ValidationError::invalid_screen, "background_color");
      failure.screen_index = static_cast<std::int16_t>(screen_index);
      return failure;
    }
    if (screen.widget_count > screen.widgets.size() ||
        screen.text_widget_count > screen.text_widgets.size() ||
        screen.delta_time_widget_count > screen.delta_time_widgets.size()) {
      (void)reject(failure, ValidationError::invalid_screen, "widgets");
      failure.screen_index = static_cast<std::int16_t>(screen_index);
      return failure;
    }
    // A Delta Time widget renders module state, so the module section must be
    // present for the widget to have anything to show.
    if (screen.delta_time_widget_count > 0 &&
        !configuration.delta_time_present) {
      (void)reject(failure, ValidationError::invalid_dashboard, "delta_time");
      failure.screen_index = static_cast<std::int16_t>(screen_index);
      return failure;
    }

    for (std::size_t index = 0; index < screen.widget_count; ++index) {
      const WidgetReference& reference = screen.widgets[index];
      bool valid = false;
      switch (reference.type) {
        case WidgetType::text:
          valid = reference.index < screen.text_widget_count &&
                  validator.text_widget(screen.text_widgets[reference.index]);
          break;
        case WidgetType::delta_time:
          valid =
              reference.index < screen.delta_time_widget_count &&
              validator.delta_time_widget(
                  screen.delta_time_widgets[reference.index]);
          break;
      }
      if (!valid) {
        (void)reject(failure, ValidationError::invalid_widget, "widgets");
        failure.screen_index = static_cast<std::int16_t>(screen_index);
        failure.widget_index = static_cast<std::int16_t>(index);
        return failure;
      }
    }

    for (std::size_t index = 0; index < screen.text_widget_count; ++index) {
      const TextWidgetConfiguration& widget = screen.text_widgets[index];
      for (std::size_t modifier = 0; modifier < widget.modifier_count;
           ++modifier) {
        if (widget.modifiers[modifier].type == ValueModifierType::lap_timer) {
          ++lap_timer_modifier_count;
        }
      }
    }
  }

  // One Lap Timer module instance backs every lap_timer modifier, so only one
  // widget may claim it across the whole dashboard.
  if (lap_timer_modifier_count > 1) {
    (void)reject(failure, ValidationError::invalid_widget, "modifiers");
    return failure;
  }
  if (!within_family_budget(configuration)) {
    (void)reject(failure, ValidationError::invalid_widget, "font");
    return failure;
  }
  return failure;
}

}  // namespace simcore::configuration
