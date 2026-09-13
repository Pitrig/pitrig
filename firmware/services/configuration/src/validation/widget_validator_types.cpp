#include <algorithm>
#include <cmath>
#include <cstddef>
#include <limits>
#include <string_view>

#include "image_asset_types.hpp"
#include "value_rules.hpp"
#include "widget_validator.hpp"

namespace pitrig::configuration::validation {
namespace {

bool ring_fits(const std::uint16_t thickness_px, const std::uint16_t radius_px,
               const WidgetPlacement& placement) {
  if (radius_px != 0) {
    return thickness_px <= 2 * radius_px;
  }
  return 2 * thickness_px <= std::min(placement.width, placement.height);
}

bool valid_gradient_middle(const std::uint32_t mid_color, const std::uint32_t grad_color) {
  return valid_optional_color(mid_color) &&
         (mid_color == kTransparentColor || grad_color != kTransparentColor);
}

bool gradient_ring_fits(const ArcWidgetConfiguration& config,
                        const DisplayValidationProfile& display) {
  if (config.fill_grad_color == kTransparentColor || config.radius_px == 0) {
    return true;
  }
  return 2 * config.radius_px + config.thickness_px <= std::max(display.width, display.height);
}

}

bool Validator::slot_page(const SlotPageConfiguration& config) {
  if (config.condition_count > config.conditions.size() ||
      config.widget_count > config.widgets.size()) {
    return reject(failure_, ValidationError::invalid_slot_page, "conditions");
  }
  if (const std::string_view out_of_range = schema::range_error(config); !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_slot_page, out_of_range);
  }
  const bool bound = registry_.resolve(value_binding_view(config.source.binding)).valid();
  switch (config.trigger) {
    case SlotTrigger::none:
      if (bound || config.condition_count != 0 || config.duration_ms != 0) {
        return reject(failure_, ValidationError::invalid_slot_page, "trigger");
      }
      return true;
    case SlotTrigger::value_changed:
      if (config.duration_ms == 0 || config.condition_count != 0) {
        return reject(failure_, ValidationError::invalid_slot_page, "duration_ms");
      }
      break;
    case SlotTrigger::conditions:
      if (config.condition_count == 0) {
        return reject(failure_, ValidationError::invalid_slot_page, "conditions");
      }
      for (std::size_t index = 0; index < config.condition_count; ++index) {
        const ValueCondition& rule = config.conditions[index];
        if (!std::isfinite(rule.value) || rule.op < ConditionOperator::above ||
            rule.op > ConditionOperator::not_equal) {
          return reject(failure_, ValidationError::invalid_slot_page, "conditions");
        }
      }
      break;
    default:
      return reject(failure_, ValidationError::invalid_slot_page, "trigger");
  }
  return value_source(config.source, "source", ValidationError::invalid_slot_page);
}

bool Validator::slot_widget(const SlotWidgetConfiguration& config) {
  const WidgetFrame& box = config.frame;
  if (box.background_color != kTransparentColor || box.background_grad_color != kTransparentColor) {
    return reject(failure_, ValidationError::invalid_slot, "background_color");
  }
  if (box.border.width_px != 0 || box.border.radius_px != 0) {
    return reject(failure_, ValidationError::invalid_slot, "border");
  }
  if (box.title.text.front() != '\0' || !value_binding_view(box.title.source.binding).empty()) {
    return reject(failure_, ValidationError::invalid_slot, "title");
  }
  if (box.condition_count != 0 || box.color_ramp.stop_count != 0 ||
      !value_binding_view(box.condition_source.binding).empty()) {
    return reject(failure_, ValidationError::invalid_slot, "conditions");
  }
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
  if (!valid_gradient_middle(config.fill_grad_mid_color, config.fill_grad_color)) {
    return reject(failure_, ValidationError::invalid_widget, "fill_grad_mid_color");
  }
  if (config.origin_present && !std::isfinite(config.origin)) {
    return reject(failure_, ValidationError::invalid_widget, "origin");
  }
  return value_source(config.source, "source") && value_range(config.range) && frame(config.frame);
}

bool Validator::arc_widget(const ArcWidgetConfiguration& config) {
  if (const std::string_view out_of_range = schema::range_error(config); !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_widget, out_of_range);
  }
  if (!ring_fits(config.thickness_px, config.radius_px, config.frame.placement)) {
    return reject(failure_, ValidationError::invalid_widget, "thickness_px");
  }
  if (!valid_color(config.fill_color) || !valid_optional_color(config.track_color)) {
    return reject(failure_, ValidationError::invalid_widget, "fill_color");
  }
  if (!valid_optional_color(config.fill_grad_color) ||
      !gradient_ring_fits(config, profile_.display)) {
    return reject(failure_, ValidationError::invalid_widget, "fill_grad_color");
  }
  if (!valid_gradient_middle(config.fill_grad_mid_color, config.fill_grad_color)) {
    return reject(failure_, ValidationError::invalid_widget, "fill_grad_mid_color");
  }
  if (config.mark < ArcMark::ring || config.mark > ArcMark::needle) {
    return reject(failure_, ValidationError::invalid_widget, "mark");
  }
  return value_source(config.source, "source") && value_range(config.range) && frame(config.frame);
}

bool Validator::indicator_widget(const IndicatorWidgetConfiguration& config) {
  if (config.orientation < BarOrientation::horizontal ||
      config.orientation > BarOrientation::vertical) {
    return reject(failure_, ValidationError::invalid_widget, "orientation");
  }
  if (config.shape < IndicatorShape::strip || config.shape > IndicatorShape::arc) {
    return reject(failure_, ValidationError::invalid_widget, "shape");
  }
  if (config.shape == IndicatorShape::arc &&
      !ring_fits(config.thickness_px, config.radius_px, config.frame.placement)) {
    return reject(failure_, ValidationError::invalid_widget, "thickness_px");
  }
  if (config.segment_count == 0 || config.segment_count > config.segments.size()) {
    return reject(failure_, ValidationError::invalid_widget, "segments");
  }
  float previous = -std::numeric_limits<float>::infinity();
  for (std::size_t index = 0; index < config.segment_count; ++index) {
    const IndicatorSegment& segment = config.segments[index];
    if (!std::isfinite(segment.threshold) || segment.threshold < previous ||
        !valid_color(segment.color)) {
      return reject(failure_, ValidationError::invalid_widget, "segments");
    }
    if (segment.threshold < 0.0F || segment.threshold > 1.0F) {
      return reject(failure_, ValidationError::invalid_widget, "segments.threshold");
    }
    previous = segment.threshold;
  }
  if (!std::isfinite(config.blink_threshold)) {
    return reject(failure_, ValidationError::invalid_widget, "blink_threshold");
  }
  if (const std::string_view out_of_range = schema::range_error(config); !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_widget, out_of_range);
  }
  if (!valid_optional_color(config.off_color)) {
    return reject(failure_, ValidationError::invalid_widget, "off_color");
  }
  return value_source(config.source, "source") && value_range(config.range) && frame(config.frame);
}

bool Validator::graph_widget(const GraphWidgetConfiguration& config) {
  if (const std::string_view out_of_range = schema::range_error(config); !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_widget, out_of_range);
  }
  if (!valid_color(config.line_color)) {
    return reject(failure_, ValidationError::invalid_widget, "line_color");
  }
  if (config.trace_count > config.traces.size()) {
    return reject(failure_, ValidationError::invalid_widget, "traces");
  }
  for (std::size_t index = 0; index < config.trace_count; ++index) {
    const GraphTraceConfiguration& trace = config.traces[index];
    if (!valid_color(trace.line_color)) {
      return reject(failure_, ValidationError::invalid_widget, "traces");
    }
    if (!value_source(trace.source, "source") || !value_range(trace.range)) {
      return false;
    }
  }
  return value_source(config.source, "source") && value_range(config.range) && frame(config.frame);
}

bool Validator::image_widget(const ImageWidgetConfiguration& config) {
  if (!terminated(config.image) || !image_assets::valid_image_id(config.image)) {
    return reject(failure_, ValidationError::invalid_widget, "image");
  }
  if (!valid_optional_color(config.recolor)) {
    return reject(failure_, ValidationError::invalid_widget, "recolor");
  }
  if (const std::string_view out_of_range = schema::range_error(config); !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_widget, out_of_range);
  }
  if (config.sprite_frame_source_present &&
      !value_source(config.sprite_frame_source, "sprite_frame_source")) {
    return false;
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
  if (config.source_count == 0 || config.source_count > config.sources.size()) {
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

}
