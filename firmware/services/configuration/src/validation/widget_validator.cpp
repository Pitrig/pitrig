#include "widget_validator.hpp"

#include <cmath>
#include <cstddef>
#include <string_view>

#include "image_asset_types.hpp"
#include "value_rules.hpp"

namespace simcore::configuration::validation {

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
        !valid_optional_color(rule.border_color)) {
      return reject(failure_, ValidationError::invalid_widget, "conditions");
    }
    if (const std::string_view out_of_range = schema::range_error(rule);
        !out_of_range.empty()) {
      return reject(failure_, ValidationError::invalid_widget, out_of_range);
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
  if (!valid_color(config.border.color)) {
    return reject(failure_, ValidationError::invalid_widget, "border");
  }
  // Everything the schema states as a plain bound, checked from the schema:
  // the border line, its radius, and the padding around a caption that widens
  // the mask cutting that line.
  if (const std::string_view out_of_range = schema::range_error(config);
      !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_widget, out_of_range);
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
      config.title.alignment < TextAlignment::top_left ||
      config.title.alignment > TextAlignment::bottom_right ||
      (config.title.text.front() != '\0' && !valid_font(config.title.font))) {
    return reject(failure_, ValidationError::invalid_widget, "title");
  }
  return conditions(config);
}

// A page's rules select which page of the slot is shown rather than restyling
// anything, so the operator and the watched source are all there is to check.
// What each trigger requires is stated per trigger rather than loosely for all
// three: a binding, a rule or a duration that nothing reads is how an author
// comes to believe an alert works.
bool Validator::slot_page(const SlotPageConfiguration& config) {
  if (config.condition_count > config.conditions.size() ||
      config.widget_count > config.widgets.size()) {
    return reject(failure_, ValidationError::invalid_slot_page, "conditions");
  }
  if (const std::string_view out_of_range = schema::range_error(config);
      !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_slot_page, out_of_range);
  }
  const bool bound =
      registry_.resolve(value_binding_view(config.source.binding)).valid();
  switch (config.trigger) {
    case SlotTrigger::none:
      if (bound || config.condition_count != 0 || config.duration_ms != 0) {
        return reject(failure_, ValidationError::invalid_slot_page, "trigger");
      }
      return true;
    case SlotTrigger::value_changed:
      // Without a duration the page would be raised and dropped inside one
      // evaluation, which is a page that never appears.
      if (config.duration_ms == 0 || config.condition_count != 0) {
        return reject(failure_, ValidationError::invalid_slot_page,
                      "duration_ms");
      }
      break;
    case SlotTrigger::conditions:
      if (config.condition_count == 0) {
        return reject(failure_, ValidationError::invalid_slot_page,
                      "conditions");
      }
      for (std::size_t index = 0; index < config.condition_count; ++index) {
        const SlotCondition& rule = config.conditions[index];
        if (!std::isfinite(rule.value) || rule.op < ConditionOperator::above ||
            rule.op > ConditionOperator::not_equal) {
          return reject(failure_, ValidationError::invalid_slot_page,
                        "conditions");
        }
      }
      break;
    default:
      return reject(failure_, ValidationError::invalid_slot_page, "trigger");
  }
  if (!bound || config.source.modifier_count > config.source.modifiers.size()) {
    return reject(failure_, ValidationError::invalid_slot_page, "source");
  }
  return true;
}

// A slot draws nothing — it is an area that switches what it shows. Every
// property that would paint it is refused rather than ignored, so an author who
// wants a panel there learns to put a shape behind the slot instead of
// wondering why a background never appeared.
bool Validator::slot_widget(const SlotWidgetConfiguration& config) {
  const WidgetFrame& box = config.frame;
  if (box.background_color != kTransparentColor ||
      box.background_grad_color != kTransparentColor) {
    return reject(failure_, ValidationError::invalid_slot, "background_color");
  }
  if (box.border.width_px != 0 || box.border.radius_px != 0) {
    return reject(failure_, ValidationError::invalid_slot, "border");
  }
  if (box.title.text.front() != '\0') {
    return reject(failure_, ValidationError::invalid_slot, "title");
  }
  if (box.condition_count != 0 || box.color_ramp.stop_count != 0 ||
      !value_binding_view(box.condition_source.binding).empty()) {
    return reject(failure_, ValidationError::invalid_slot, "conditions");
  }
  // A tap here already means "next page", so an action would give one tap two
  // meanings. Refused rather than ranked.
  if (box.action.type != WidgetActionType::none) {
    return reject(failure_, ValidationError::invalid_slot, "action");
  }
  if (config.page_count == 0 || config.page_count > config.pages.size()) {
    return reject(failure_, ValidationError::invalid_slot, "pages");
  }
  bool loop{};
  for (std::size_t index = 0; index < config.page_count; ++index) {
    if (!slot_page(config.pages[index])) {
      return false;
    }
    loop = loop || config.pages[index].in_loop;
  }
  // With only event pages a slot would show nothing at all once its events
  // pass, and nothing the driver could do would bring anything back.
  if (!loop) {
    return reject(failure_, ValidationError::invalid_slot, "in_loop");
  }
  return frame(config.frame);
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
  if (const std::string_view out_of_range = schema::range_error(config);
      !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_widget, out_of_range);
  }
  // Not a plain bound and so not in the schema: two arcs of the configured
  // thickness have to fit across this widget, or the ring closes into a disc.
  const std::int32_t smallest_side =
      std::min(config.frame.placement.width, config.frame.placement.height);
  if (2 * config.thickness_px > smallest_side) {
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
  if (const std::string_view out_of_range = schema::range_error(config);
      !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_widget, out_of_range);
  }
  if (!valid_optional_color(config.off_color)) {
    return reject(failure_, ValidationError::invalid_widget, "off_color");
  }
  return value_source(config.source) && value_range(config.range) &&
         frame(config.frame);
}

bool Validator::graph_widget(const GraphWidgetConfiguration& config) {
  if (const std::string_view out_of_range = schema::range_error(config);
      !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_widget, out_of_range);
  }
  if (!valid_color(config.line_color)) {
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
  if (config.widget_count > config.widgets.size()) {
    return reject(failure_, ValidationError::invalid_widget, "widgets");
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
      config.value.alignment < TextAlignment::top_left ||
      config.value.alignment > TextAlignment::bottom_right) {
    return reject(failure_, ValidationError::invalid_widget, "value");
  }
  return true;
}
}  // namespace simcore::configuration::validation
