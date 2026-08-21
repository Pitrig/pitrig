#include "widget_validator.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <limits>
#include <string_view>

#include "image_asset_types.hpp"
#include "value_rules.hpp"

// The per-type half of the widget validator: what each widget kind demands of
// its own properties. The checks every kind shares — the frame, the styling
// rules, the value sources — live in widget_validator.cpp.
namespace simcore::configuration::validation {

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
  if (config.trace_count > config.traces.size()) {
    return reject(failure_, ValidationError::invalid_widget, "traces");
  }
  // Every further trace is a source and a window in its own right, so each is
  // held to what the widget's own source is held to.
  for (std::size_t index = 0; index < config.trace_count; ++index) {
    const GraphTraceConfiguration& trace = config.traces[index];
    if (!valid_color(trace.line_color)) {
      return reject(failure_, ValidationError::invalid_widget, "traces");
    }
    if (!value_source(trace.source) || !value_range(trace.range)) {
      return false;
    }
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
  // How many frames the sheet holds is an asset question, settled at
  // composition alongside whether the image is installed at all. What the
  // document can be held to is that the source names a real field.
  if (config.sprite_frame_source_present) {
    if (!registry_
             .resolve(value_binding_view(config.sprite_frame_source.binding))
             .valid()) {
      return reject(failure_, ValidationError::invalid_widget,
                    "sprite_frame_source");
    }
    if (config.sprite_frame_source.modifier_count >
        config.sprite_frame_source.modifiers.size()) {
      return reject(failure_, ValidationError::invalid_widget,
                    "sprite_frame_source");
    }
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
