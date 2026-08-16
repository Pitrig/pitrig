#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <limits>
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

// Blink bounds: faster than this is a strobe rather than an indicator, slower
// reads as a widget that failed to update.
constexpr std::uint16_t kMinimumBlinkMs = 100;
constexpr std::uint16_t kMaximumBlinkMs = 5'000;
// A rule that outlives its match by more than this stops reading as a reaction
// to the car and starts reading as a stuck widget.
constexpr std::uint16_t kMaximumHoldMs = 10'000;

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

  // Widget storage is one pool, so this walks it once rather than per screen.
  const DashboardConfiguration& dashboard = configuration.dashboard;
  const auto record_caption = [&record](const WidgetFrame& frame) {
    return frame.title.text.front() == '\0' || record(frame.title.font);
  };
  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    const TextWidgetConfiguration& widget = dashboard.text_widgets[index];
    if (!record(widget.value.font) || !record_caption(widget.frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.shape_widget_count; ++index) {
    if (!record_caption(dashboard.shape_widgets[index].frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.bar_widget_count; ++index) {
    if (!record_caption(dashboard.bar_widgets[index].frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.arc_widget_count; ++index) {
    if (!record_caption(dashboard.arc_widgets[index].frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.indicator_widget_count;
       ++index) {
    if (!record_caption(dashboard.indicator_widgets[index].frame)) {
      return false;
    }
  }
  for (std::size_t index = 0; index < dashboard.graph_widget_count; ++index) {
    if (!record_caption(dashboard.graph_widgets[index].frame)) {
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

// Owns the one immutable telemetry registry every widget resolves against. It
// used to be constructed per widget on the validating task's stack.
class Validator final {
 public:
  Validator(const ValidationContext& profile, ValidationFailure& failure)
      : profile_(profile), failure_(failure) {}

  [[nodiscard]] bool text_widget(const TextWidgetConfiguration& config);
  [[nodiscard]] bool shape_widget(const ShapeWidgetConfiguration& config);
  [[nodiscard]] bool bar_widget(const BarWidgetConfiguration& config);
  [[nodiscard]] bool arc_widget(const ArcWidgetConfiguration& config);
  [[nodiscard]] bool indicator_widget(const IndicatorWidgetConfiguration& config);
  [[nodiscard]] bool graph_widget(const GraphWidgetConfiguration& config);

 private:
  [[nodiscard]] bool frame(const WidgetFrame& config);
  [[nodiscard]] bool value_source(const ValueSourceConfiguration& config);
  [[nodiscard]] bool value_range(const ValueRange& range);
  [[nodiscard]] bool text_source(const TextSourceConfiguration& config);
  [[nodiscard]] bool conditions(const WidgetFrame& config);

  [[nodiscard]] std::int32_t width() const { return profile_.display.width; }
  [[nodiscard]] std::int32_t height() const { return profile_.display.height; }

  const telemetry::TelemetryRegistry registry_{};
  const ValidationContext& profile_;
  ValidationFailure& failure_;
};

bool Validator::text_source(const TextSourceConfiguration& config) {
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
  return true;
}

// Styling rules read one telemetry source and may not blink faster than the eye
// can follow or so slowly that the widget looks broken.
bool Validator::conditions(const WidgetFrame& config) {
  if (config.condition_count > config.conditions.size() ||
      config.color_ramp.stop_count > config.color_ramp.stops.size()) {
    return reject(failure_, ValidationError::invalid_widget, "conditions");
  }
  // A ramp needs at least two stops to interpolate between, and its stops have
  // to climb, or the search for the pair a value sits between has no answer.
  if (config.color_ramp.stop_count == 1) {
    return reject(failure_, ValidationError::invalid_widget, "color_ramp");
  }
  float previous = -std::numeric_limits<float>::infinity();
  for (std::size_t index = 0; index < config.color_ramp.stop_count; ++index) {
    const ColorStop& stop = config.color_ramp.stops[index];
    if (!std::isfinite(stop.at) || stop.at <= previous ||
        !valid_color(stop.color)) {
      return reject(failure_, ValidationError::invalid_widget, "color_ramp");
    }
    previous = stop.at;
  }
  if (config.color_ramp.target < ColorRampTarget::content ||
      config.color_ramp.target > ColorRampTarget::border) {
    return reject(failure_, ValidationError::invalid_widget, "color_ramp");
  }
  // Both mechanisms read the same source, so neither is configurable without
  // one that resolves.
  if (config.condition_count == 0 && config.color_ramp.stop_count == 0) {
    return true;
  }
  const std::string_view binding =
      value_binding_view(config.condition_source.binding);
  if (!registry_.resolve(binding).valid()) {
    return reject(failure_, ValidationError::invalid_widget,
                  "condition_source");
  }
  if (config.condition_source.modifier_count >
      config.condition_source.modifiers.size()) {
    return reject(failure_, ValidationError::invalid_widget,
                  "condition_source");
  }
  for (std::size_t index = 0; index < config.condition_count; ++index) {
    const WidgetCondition& rule = config.conditions[index];
    if (rule.op < ConditionOperator::above ||
        rule.op > ConditionOperator::not_equal ||
        !std::isfinite(rule.value) || !valid_optional_color(rule.color) ||
        !valid_optional_color(rule.background_color) ||
        !valid_optional_color(rule.border_color) ||
        (rule.blink_ms != 0 &&
         (rule.blink_ms < kMinimumBlinkMs || rule.blink_ms > kMaximumBlinkMs)) ||
        rule.hold_ms > kMaximumHoldMs) {
      return reject(failure_, ValidationError::invalid_widget, "conditions");
    }
  }
  return true;
}

// Geometry, box and styling rules belong to every widget type, so each one
// validates them here rather than repeating the same checks.
bool Validator::frame(const WidgetFrame& config) {
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
  // The inset eats into the widget from both sides, so it cannot claim more
  // than the box has to give.
  if (2 * config.background_inset_px + 2 * config.border.width_px >=
          config.placement.width ||
      2 * config.background_inset_px + 2 * config.border.width_px >=
          config.placement.height) {
    return reject(failure_, ValidationError::invalid_widget,
                  "background_inset_px");
  }
  if (!valid_optional_color(config.background_grad_color) ||
      config.background_grad_dir < GradientDirection::horizontal ||
      config.background_grad_dir > GradientDirection::vertical) {
    return reject(failure_, ValidationError::invalid_widget,
                  "background_grad_color");
  }
  if (!valid_optional_color(config.background_color)) {
    return reject(failure_, ValidationError::invalid_widget,
                  "background_color");
  }
  if (!terminated(config.id)) {
    return reject(failure_, ValidationError::invalid_widget, "id");
  }
  if (!terminated(config.title.text) || !valid_color(config.title.color) ||
      (config.title.text.front() != '\0' && !valid_font(config.title.font))) {
    return reject(failure_, ValidationError::invalid_widget, "title");
  }
  return conditions(config);
}

// A widget that maps one source through a window needs a resolvable binding
// and a window with something in it.
bool Validator::value_source(const ValueSourceConfiguration& config) {
  if (!registry_.resolve(value_binding_view(config.binding)).valid()) {
    return reject(failure_, ValidationError::invalid_widget, "source");
  }
  if (config.modifier_count > config.modifiers.size()) {
    return reject(failure_, ValidationError::invalid_widget, "source");
  }
  return true;
}

bool Validator::value_range(const ValueRange& range) {
  if (!std::isfinite(range.minimum) || !std::isfinite(range.maximum) ||
      range.maximum <= range.minimum) {
    return reject(failure_, ValidationError::invalid_widget, "maximum");
  }
  return true;
}

bool Validator::bar_widget(const BarWidgetConfiguration& config) {
  if (config.orientation < BarOrientation::horizontal ||
      config.orientation > BarOrientation::vertical) {
    return reject(failure_, ValidationError::invalid_widget, "orientation");
  }
  if (!valid_color(config.fill_color)) {
    return reject(failure_, ValidationError::invalid_widget, "fill_color");
  }
  if (!valid_optional_color(config.fill_grad_color)) {
    return reject(failure_, ValidationError::invalid_widget, "fill_grad_color");
  }
  if (config.origin_present && !std::isfinite(config.origin)) {
    return reject(failure_, ValidationError::invalid_widget, "origin");
  }
  return value_source(config.source) && value_range(config.range) &&
         frame(config.frame);
}

// A shape is its frame, so there is nothing else to check.
bool Validator::arc_widget(const ArcWidgetConfiguration& config) {
  // A sweep of zero would draw nothing and a sweep past a full turn would wrap
  // over itself, so both are authoring mistakes rather than degenerate art.
  if (config.sweep_deg == 0 || config.sweep_deg > 360) {
    return reject(failure_, ValidationError::invalid_widget, "sweep_deg");
  }
  if (config.start_angle_deg >= 360) {
    return reject(failure_, ValidationError::invalid_widget, "start_angle_deg");
  }
  // Two arcs of the configured thickness have to fit across the widget, or the
  // ring closes into a disc.
  const std::int32_t smallest_side =
      std::min(config.frame.placement.width, config.frame.placement.height);
  if (config.thickness_px == 0 || 2 * config.thickness_px > smallest_side) {
    return reject(failure_, ValidationError::invalid_widget, "thickness_px");
  }
  if (!valid_color(config.fill_color) || !valid_optional_color(config.track_color)) {
    return reject(failure_, ValidationError::invalid_widget, "fill_color");
  }
  return value_source(config.source) && value_range(config.range) &&
         frame(config.frame);
}

bool Validator::indicator_widget(const IndicatorWidgetConfiguration& config) {
  if (config.orientation < BarOrientation::horizontal ||
      config.orientation > BarOrientation::vertical) {
    return reject(failure_, ValidationError::invalid_widget, "orientation");
  }
  if (config.segment_count == 0 ||
      config.segment_count > config.segments.size()) {
    return reject(failure_, ValidationError::invalid_widget, "segments");
  }
  // Thresholds are read in order and the first one not reached stops the strip,
  // so an out-of-order list would leave segments that can never light.
  float previous = -std::numeric_limits<float>::infinity();
  for (std::size_t index = 0; index < config.segment_count; ++index) {
    const IndicatorSegment& segment = config.segments[index];
    if (!std::isfinite(segment.threshold) || segment.threshold < previous ||
        !valid_color(segment.color)) {
      return reject(failure_, ValidationError::invalid_widget, "segments");
    }
    previous = segment.threshold;
  }
  if (!std::isfinite(config.blink_threshold)) {
    return reject(failure_, ValidationError::invalid_widget, "blink_threshold");
  }
  // The same window conditions blink in, so one dashboard has one cadence.
  if (config.blink_ms != 0 &&
      (config.blink_ms < kMinimumBlinkMs || config.blink_ms > kMaximumBlinkMs)) {
    return reject(failure_, ValidationError::invalid_widget, "blink_ms");
  }
  if (!valid_optional_color(config.off_color)) {
    return reject(failure_, ValidationError::invalid_widget, "off_color");
  }
  return value_source(config.source) && value_range(config.range) &&
         frame(config.frame);
}

bool Validator::graph_widget(const GraphWidgetConfiguration& config) {
  if (config.point_count < 2 || config.point_count > kMaximumGraphPoints) {
    return reject(failure_, ValidationError::invalid_widget, "point_count");
  }
  if (config.sample_interval_ms == 0) {
    return reject(failure_, ValidationError::invalid_widget,
                  "sample_interval_ms");
  }
  if (config.line_width_px == 0 || !valid_color(config.line_color)) {
    return reject(failure_, ValidationError::invalid_widget, "line_color");
  }
  return value_source(config.source) && value_range(config.range) &&
         frame(config.frame);
}

bool Validator::shape_widget(const ShapeWidgetConfiguration& config) {
  if (config.kind < ShapeKind::rectangle || config.kind > ShapeKind::ellipse) {
    return reject(failure_, ValidationError::invalid_widget, "kind");
  }
  return frame(config.frame);
}

bool Validator::text_widget(const TextWidgetConfiguration& config) {
  // A widget with no source has nothing to render, and its LVGL label would be
  // sized from an empty placeholder.
  if (config.source_count == 0 ||
      config.source_count > config.sources.size()) {
    return reject(failure_, ValidationError::invalid_widget, "sources");
  }
  for (std::size_t index = 0; index < config.source_count; ++index) {
    if (!text_source(config.sources[index])) {
      return false;
    }
  }
  if (!frame(config.frame)) {
    return false;
  }
  if (!valid_font(config.value.font) || !valid_color(config.value.color) ||
      !terminated(config.value.unavailable_text) ||
      config.value.alignment < TextAlignment::left ||
      config.value.alignment > TextAlignment::right) {
    return reject(failure_, ValidationError::invalid_widget, "value");
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

  const DashboardConfiguration& dashboard = configuration.dashboard;
  if (dashboard.screen_count > dashboard.screens.size()) {
    (void)reject(failure, ValidationError::invalid_screen, "dashboard.screens");
    return failure;
  }
  if (dashboard.text_widget_count > dashboard.text_widgets.size() ||
      dashboard.shape_widget_count > dashboard.shape_widgets.size() ||
      dashboard.bar_widget_count > dashboard.bar_widgets.size() ||
      dashboard.arc_widget_count > dashboard.arc_widgets.size() ||
      dashboard.indicator_widget_count > dashboard.indicator_widgets.size() ||
      dashboard.graph_widget_count > dashboard.graph_widgets.size()) {
    (void)reject(failure, ValidationError::invalid_dashboard, "dashboard");
    return failure;
  }

  // A reference index is a std::uint8_t, so a pool that outgrew that would
  // silently alias its first entries.
  static_assert(kMaximumTextWidgets <= 255);
  static_assert(kMaximumShapeWidgets <= 255);
  static_assert(kMaximumBarWidgets <= 255);
  static_assert(kMaximumArcWidgets <= 255);
  static_assert(kMaximumIndicatorWidgets <= 255);
  static_assert(kMaximumGraphWidgets <= 255);

  Validator validator(profile, failure);
  std::size_t lap_timer_modifier_count{};
  std::size_t referenced_widgets{};

  for (std::size_t screen_index = 0; screen_index < dashboard.screen_count;
       ++screen_index) {
    const ScreenConfiguration& screen = dashboard.screens[screen_index];
    if (!valid_color(screen.background_color) || !terminated(screen.id)) {
      (void)reject(failure, ValidationError::invalid_screen, "background_color");
      failure.screen_index = static_cast<std::int16_t>(screen_index);
      return failure;
    }
    if (screen.widget_count > screen.widgets.size()) {
      (void)reject(failure, ValidationError::invalid_screen, "widgets");
      failure.screen_index = static_cast<std::int16_t>(screen_index);
      return failure;
    }
    referenced_widgets += screen.widget_count;
    for (std::size_t index = 0; index < screen.widget_count; ++index) {
      const WidgetReference& reference = screen.widgets[index];
      bool valid = false;
      switch (reference.type) {
        case WidgetType::text:
          valid = reference.index < dashboard.text_widget_count &&
                  dashboard.text_widgets[reference.index]
                          .frame.screen_index == screen_index &&
                  validator.text_widget(dashboard.text_widgets[reference.index]);
          break;
        case WidgetType::shape:
          valid = reference.index < dashboard.shape_widget_count &&
                  dashboard.shape_widgets[reference.index]
                          .frame.screen_index == screen_index &&
                  validator.shape_widget(dashboard.shape_widgets[reference.index]);
          break;
        case WidgetType::bar:
          valid = reference.index < dashboard.bar_widget_count &&
                  dashboard.bar_widgets[reference.index]
                          .frame.screen_index == screen_index &&
                  validator.bar_widget(dashboard.bar_widgets[reference.index]);
          break;
        case WidgetType::arc:
          valid = reference.index < dashboard.arc_widget_count &&
                  dashboard.arc_widgets[reference.index]
                          .frame.screen_index == screen_index &&
                  validator.arc_widget(dashboard.arc_widgets[reference.index]);
          break;
        case WidgetType::indicator:
          valid = reference.index < dashboard.indicator_widget_count &&
                  dashboard.indicator_widgets[reference.index]
                          .frame.screen_index == screen_index &&
                  validator.indicator_widget(
                      dashboard.indicator_widgets[reference.index]);
          break;
        case WidgetType::graph:
          valid = reference.index < dashboard.graph_widget_count &&
                  dashboard.graph_widgets[reference.index]
                          .frame.screen_index == screen_index &&
                  validator.graph_widget(
                      dashboard.graph_widgets[reference.index]);
          break;
      }
      if (!valid) {
        (void)reject(failure, ValidationError::invalid_widget, "widgets");
        failure.screen_index = static_cast<std::int16_t>(screen_index);
        failure.widget_index = static_cast<std::int16_t>(index);
        return failure;
      }
    }

  }

  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    const TextWidgetConfiguration& widget = dashboard.text_widgets[index];
    for (std::size_t source = 0; source < widget.source_count; ++source) {
      const TextSourceConfiguration& value = widget.sources[source];
      for (std::size_t modifier = 0; modifier < value.modifier_count;
           ++modifier) {
        if (value.modifiers[modifier].type == ValueModifierType::lap_timer) {
          ++lap_timer_modifier_count;
        }
      }
    }
  }

  // Only the parser produces documents, and it appends one reference per pool
  // slot it fills. An unreferenced slot would render nothing and still cost its
  // storage, so treat the mismatch as a malformed dashboard rather than trust
  // that no other path can build one.
  if (referenced_widgets !=
      static_cast<std::size_t>(dashboard.text_widget_count) +
          dashboard.shape_widget_count + dashboard.bar_widget_count +
          dashboard.arc_widget_count + dashboard.indicator_widget_count +
          dashboard.graph_widget_count) {
    (void)reject(failure, ValidationError::invalid_dashboard, "dashboard");
    return failure;
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
