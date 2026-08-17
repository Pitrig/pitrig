#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <limits>
#include <span>
#include <string_view>

#include "configuration_json.hpp"
#include "image_asset_types.hpp"
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
  for (std::size_t index = 0; index < dashboard.image_widget_count; ++index) {
    if (!record_caption(dashboard.image_widgets[index].frame)) {
      return false;
    }
  }
  return true;
}

// A box is refused only when it is *entirely* off the display, never for
// leaving its container. A caption already overhangs its widget's border by
// design, and an author may legitimately let a readout hang past the panel it
// belongs to; the display is the one edge that has no pixels beyond it.
// `origin` is where the widget's parent sits, so `placement` stays the relative
// geometry the document authored.
[[nodiscard]] bool on_display(const std::int32_t origin_x,
                              const std::int32_t origin_y,
                              const WidgetPlacement& placement,
                              const std::int32_t display_width,
                              const std::int32_t display_height) {
  if (placement.width < 0 || placement.height < 0) {
    return false;
  }
  const std::int32_t left = origin_x + placement.x;
  const std::int32_t top = origin_y + placement.y;
  return left + placement.width > 0 && top + placement.height > 0 &&
         left < display_width && top < display_height;
}

// A target that names no screen would send a tap nowhere, and a screen named by
// an action type that navigates relatively is a property that does nothing —
// both are authoring mistakes rather than harmless noise, so both are refused.
// `screens` is the document's screen list, which is what the id must match.
[[nodiscard]] bool valid_action(const WidgetAction& action,
                                const DashboardConfiguration& dashboard) {
  const std::string_view target = text_view(action.screen);
  switch (action.type) {
    case WidgetActionType::none:
      return target.empty();
    case WidgetActionType::next_screen:
    case WidgetActionType::previous_screen:
      return target.empty();
    case WidgetActionType::goto_screen:
      break;
  }
  if (target.empty()) {
    return false;
  }
  for (std::size_t index = 0; index < dashboard.screen_count; ++index) {
    if (text_view(dashboard.screens[index].id) == target) {
      return true;
    }
  }
  return false;
}

[[nodiscard]] bool same_box(const WidgetPlacement& left,
                           const WidgetPlacement& right) {
  return left.x == right.x && left.y == right.y && left.width == right.width &&
         left.height == right.height;
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

  // Where the parent of the widgets being validated sits on the display. Widget
  // geometry is relative to its container, so this is what turns it into
  // something the display bound can be applied to. A screen's origin is (0,0),
  // which is why a widget straight on a screen needs no special handling.
  void set_parent_origin(const std::int32_t x, const std::int32_t y) {
    origin_x_ = x;
    origin_y_ = y;
  }

  [[nodiscard]] bool slot_conditions(const ShapeWidgetConfiguration& config);
  [[nodiscard]] bool text_widget(const TextWidgetConfiguration& config);
  [[nodiscard]] bool shape_widget(const ShapeWidgetConfiguration& config);
  [[nodiscard]] bool bar_widget(const BarWidgetConfiguration& config);
  [[nodiscard]] bool arc_widget(const ArcWidgetConfiguration& config);
  [[nodiscard]] bool indicator_widget(const IndicatorWidgetConfiguration& config);
  [[nodiscard]] bool graph_widget(const GraphWidgetConfiguration& config);
  [[nodiscard]] bool image_widget(const ImageWidgetConfiguration& config);

 private:
  [[nodiscard]] bool frame(const WidgetFrame& config);
  [[nodiscard]] bool value_source(const ValueSourceConfiguration& config);
  [[nodiscard]] bool value_range(const ValueRange& range);
  [[nodiscard]] bool text_source(const TextSourceConfiguration& config);
  [[nodiscard]] bool conditions(const WidgetFrame& config);

  const telemetry::TelemetryRegistry registry_{};
  const ValidationContext& profile_;
  ValidationFailure& failure_;
  std::int32_t origin_x_{};
  std::int32_t origin_y_{};
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
  if (!on_display(origin_x_, origin_y_, config.placement,
                  profile_.display.width, profile_.display.height)) {
    return reject(failure_, ValidationError::invalid_widget, "placement");
  }
  // Bounded by the display rather than by the container: padding eats into the
  // widget's own box, and a container is no longer what limits a widget.
  if (config.padding.left > profile_.display.width ||
      config.padding.right > profile_.display.width ||
      config.padding.top > profile_.display.height ||
      config.padding.bottom > profile_.display.height) {
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
  // The gap padding widens the mask that hides the frame line, so it is bounded
  // like the line itself rather than left to the full range of its type.
  if (!terminated(config.title.text) || !valid_color(config.title.color) ||
      config.title.alignment < TextAlignment::top_left ||
      config.title.alignment > TextAlignment::bottom_right ||
      config.title.gap_padding_px > 240 ||
      (config.title.text.front() != '\0' && !valid_font(config.title.font))) {
    return reject(failure_, ValidationError::invalid_widget, "title");
  }
  return conditions(config);
}

// A widget that maps one source through a window needs a resolvable binding
// and a window with something in it.
// A slot's rules select which shape of that slot is shown rather than restyling
// anything, so the operator and the watched source are all there is to check.
// Rules on a shape outside a slot would select nothing, which is authoring
// intent that cannot take effect and is therefore refused.
bool Validator::slot_conditions(const ShapeWidgetConfiguration& config) {
  if (config.slot_condition_count == 0) {
    return true;
  }
  if (config.slot == 0) {
    return reject(failure_, ValidationError::invalid_widget, "slot_conditions");
  }
  for (std::size_t index = 0; index < config.slot_condition_count; ++index) {
    const SlotCondition& rule = config.slot_conditions[index];
    if (!std::isfinite(rule.value) || rule.op < ConditionOperator::above ||
        rule.op > ConditionOperator::not_equal) {
      return reject(failure_, ValidationError::invalid_widget,
                    "slot_conditions");
    }
  }
  if (!registry_.resolve(value_binding_view(config.slot_source.binding))
           .valid() ||
      config.slot_source.modifier_count > config.slot_source.modifiers.size()) {
    return reject(failure_, ValidationError::invalid_widget, "slot_source");
  }
  return true;
}

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

bool Validator::image_widget(const ImageWidgetConfiguration& config) {
  // Whether the image is installed is a composition question, checked before a
  // replacement is applied; whether the name could ever be one is this.
  if (!terminated(config.image) ||
      !image_assets::valid_image_id(config.image)) {
    return reject(failure_, ValidationError::invalid_widget, "image");
  }
  if (!valid_optional_color(config.recolor)) {
    return reject(failure_, ValidationError::invalid_widget, "recolor");
  }
  return frame(config.frame);
}

bool Validator::shape_widget(const ShapeWidgetConfiguration& config) {
  if (config.kind < ShapeKind::rectangle || config.kind > ShapeKind::ellipse) {
    return reject(failure_, ValidationError::invalid_widget, "kind");
  }
  if (config.slot > kMaximumSlots) {
    return reject(failure_, ValidationError::invalid_widget, "slot");
  }
  // A shape in a slot spends its tap on cycling, so it cannot also navigate.
  if (config.slot != 0 && config.frame.action.type != WidgetActionType::none) {
    return reject(failure_, ValidationError::invalid_widget, "action");
  }
  // Slot membership and a hiding rule both write the same LVGL flag, so one
  // would fight the other every refresh. The slot already decides visibility.
  if (config.slot != 0) {
    for (std::size_t index = 0; index < config.frame.condition_count; ++index) {
      if (config.frame.conditions[index].hidden) {
        return reject(failure_, ValidationError::invalid_widget, "conditions");
      }
    }
  }
  if (config.widget_count > config.widgets.size()) {
    return reject(failure_, ValidationError::invalid_widget, "widgets");
  }
  return slot_conditions(config) && frame(config.frame);
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
      config.value.alignment < TextAlignment::top_left ||
      config.value.alignment > TextAlignment::bottom_right) {
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

// One ordered reference table, whether it belongs to a screen or to a container
// shape. Each entry must name a filled pool slot whose widget agrees about the
// parent that declared it, so a document cannot point two parents at one widget
// or leave a widget claiming a parent that never referenced it.
[[nodiscard]] bool validate_references(
    const DashboardConfiguration& dashboard,
    const std::span<const WidgetReference> references, const std::size_t count,
    const std::size_t screen_index, const std::uint8_t parent_index,
    const bool parent_present, Validator& validator, std::size_t& action_count,
    ValidationFailure& failure) {
  // Parenting and the tap action are both facts about the frame, so one probe
  // decides whether the reference is sound before the type-specific checks run.
  const auto parented = [&](const WidgetFrame& frame) {
    if (frame.action.type != WidgetActionType::none) {
      ++action_count;
    }
    return frame.screen_index == screen_index &&
           frame.parent_present == parent_present &&
           (!parent_present || frame.parent_index == parent_index) &&
           valid_action(frame.action, dashboard);
  };
  for (std::size_t index = 0; index < count && index < references.size();
       ++index) {
    const WidgetReference& reference = references[index];
    bool valid = false;
    switch (reference.type) {
      case WidgetType::text:
        valid = reference.index < dashboard.text_widget_count &&
                parented(dashboard.text_widgets[reference.index].frame) &&
                validator.text_widget(dashboard.text_widgets[reference.index]);
        break;
      case WidgetType::shape:
        valid =
            reference.index < dashboard.shape_widget_count &&
            parented(dashboard.shape_widgets[reference.index].frame) &&
            validator.shape_widget(dashboard.shape_widgets[reference.index]);
        break;
      case WidgetType::bar:
        valid = reference.index < dashboard.bar_widget_count &&
                parented(dashboard.bar_widgets[reference.index].frame) &&
                validator.bar_widget(dashboard.bar_widgets[reference.index]);
        break;
      case WidgetType::arc:
        valid = reference.index < dashboard.arc_widget_count &&
                parented(dashboard.arc_widgets[reference.index].frame) &&
                validator.arc_widget(dashboard.arc_widgets[reference.index]);
        break;
      case WidgetType::indicator:
        valid = reference.index < dashboard.indicator_widget_count &&
                parented(dashboard.indicator_widgets[reference.index].frame) &&
                validator.indicator_widget(
                    dashboard.indicator_widgets[reference.index]);
        break;
      case WidgetType::image:
        valid =
            reference.index < dashboard.image_widget_count &&
            parented(dashboard.image_widgets[reference.index].frame) &&
            validator.image_widget(dashboard.image_widgets[reference.index]);
        break;
      case WidgetType::graph:
        valid =
            reference.index < dashboard.graph_widget_count &&
            parented(dashboard.graph_widgets[reference.index].frame) &&
            validator.graph_widget(dashboard.graph_widgets[reference.index]);
        break;
    }
    if (!valid) {
      (void)reject(failure, ValidationError::invalid_widget, "widgets");
      failure.widget_index = static_cast<std::int16_t>(index);
      return false;
    }
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
      dashboard.graph_widget_count > dashboard.graph_widgets.size() ||
      dashboard.image_widget_count > dashboard.image_widgets.size()) {
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
  static_assert(kMaximumImageWidgets <= 255);

  Validator validator(profile, failure);
  std::size_t lap_timer_modifier_count{};
  std::size_t referenced_widgets{};
  std::size_t action_count{};

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
    validator.set_parent_origin(0, 0);
    if (!validate_references(dashboard, screen.widgets, screen.widget_count,
                             screen_index, 0, false, validator, action_count,
                             failure)) {
      failure.screen_index = static_cast<std::int16_t>(screen_index);
      return failure;
    }
  }

  // Where every container sits on the display, so a child's relative geometry
  // can be checked against the one edge that still bounds it. The pool is
  // ordered parent-before-child by construction, so one forward pass resolves
  // any depth — and a parent index that is not lower than its own is the shape
  // of a cycle, which is refused here rather than assumed impossible.
  std::array<std::int32_t, kMaximumShapeWidgets> origin_x{};
  std::array<std::int32_t, kMaximumShapeWidgets> origin_y{};
  std::array<std::uint8_t, kMaximumShapeWidgets> depth{};
  for (std::size_t index = 0; index < dashboard.shape_widget_count; ++index) {
    const WidgetFrame& frame = dashboard.shape_widgets[index].frame;
    if (!frame.parent_present) {
      origin_x[index] = 0;
      origin_y[index] = 0;
      depth[index] = 0;
      continue;
    }
    if (frame.parent_index >= index) {
      (void)reject(failure, ValidationError::invalid_widget, "widgets");
      return failure;
    }
    origin_x[index] =
        origin_x[frame.parent_index] +
        dashboard.shape_widgets[frame.parent_index].frame.placement.x;
    origin_y[index] =
        origin_y[frame.parent_index] +
        dashboard.shape_widgets[frame.parent_index].frame.placement.y;
    depth[index] = static_cast<std::uint8_t>(depth[frame.parent_index] + 1);
    if (depth[index] >= kMaximumNestingDepth) {
      (void)reject(failure, ValidationError::invalid_widget, "widgets");
      return failure;
    }
  }

  // A slot is one box with one starting shape, so members that disagree on
  // either are two overlapping areas rather than one that switches. They must
  // also share a parent: coordinates under different containers are in
  // different spaces, so "the same box" would not mean the same pixels.
  for (std::uint8_t slot = 1; slot <= kMaximumSlots; ++slot) {
    const ShapeWidgetConfiguration* first{};
    std::size_t defaults{};
    std::size_t members{};
    for (std::size_t index = 0; index < dashboard.shape_widget_count; ++index) {
      const ShapeWidgetConfiguration& shape = dashboard.shape_widgets[index];
      if (shape.slot != slot) {
        continue;
      }
      ++members;
      if (shape.slot_default) {
        ++defaults;
      }
      if (first == nullptr) {
        first = &shape;
      } else if (!same_box(first->frame.placement, shape.frame.placement) ||
                 first->frame.screen_index != shape.frame.screen_index ||
                 first->frame.parent_present != shape.frame.parent_present ||
                 (shape.frame.parent_present &&
                  first->frame.parent_index != shape.frame.parent_index)) {
        (void)reject(failure, ValidationError::invalid_widget, "placement");
        return failure;
      }
    }
    if (members > 0 && defaults != 1) {
      (void)reject(failure, ValidationError::invalid_widget, "slot_default");
      return failure;
    }
  }

  // Each container's own table, flat over the pool: ordering only ever happens
  // among one parent's children, so depth costs nothing here.
  for (std::size_t index = 0; index < dashboard.shape_widget_count; ++index) {
    const ShapeWidgetConfiguration& shape = dashboard.shape_widgets[index];
    if (shape.widget_count == 0) {
      continue;
    }
    referenced_widgets += shape.widget_count;
    validator.set_parent_origin(origin_x[index] + shape.frame.placement.x,
                                origin_y[index] + shape.frame.placement.y);
    if (!validate_references(dashboard, shape.widgets, shape.widget_count,
                             shape.frame.screen_index,
                             static_cast<std::uint8_t>(index), true, validator,
                             action_count, failure)) {
      failure.screen_index =
          static_cast<std::int16_t>(shape.frame.screen_index);
      return failure;
    }
  }
  validator.set_parent_origin(0, 0);

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
          dashboard.graph_widget_count + dashboard.image_widget_count) {
    (void)reject(failure, ValidationError::invalid_dashboard, "dashboard");
    return failure;
  }

  // Each action makes one object clickable and holds one binding at runtime.
  if (action_count > kMaximumActions) {
    (void)reject(failure, ValidationError::invalid_widget, "action");
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
