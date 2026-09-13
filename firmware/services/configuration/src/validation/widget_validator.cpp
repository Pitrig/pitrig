#include "widget_validator.hpp"

#include <cmath>
#include <cstddef>
#include <string_view>

#include "image_asset_types.hpp"
#include "value_rules.hpp"

namespace pitrig::configuration::validation {

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
    if (config.modifiers[index].type != ValueModifierType::lap_timer || lap_timer_modifier) {
      return reject(failure_, ValidationError::invalid_widget, "modifiers");
    }
    lap_timer_modifier = true;
  }
  if (lap_timer_modifier && (binding != telemetry::fields::kCurrentLapTime ||
                             handle.type != telemetry::ValueType::uint32)) {
    return reject(failure_, ValidationError::invalid_widget, "modifiers");
  }

  if (!valid_transform(config.transform, handle.type)) {
    return reject(failure_, ValidationError::invalid_widget, "transform");
  }
  if (!terminated(config.transform.prefix) || !terminated(config.transform.suffix)) {
    return reject(failure_, ValidationError::invalid_widget, "transform");
  }
  return true;
}

bool Validator::conditions(const WidgetFrame& config) {
  if (config.condition_count > config.conditions.size() ||
      config.color_ramp.stop_count > config.color_ramp.stops.size()) {
    return reject(failure_, ValidationError::invalid_widget, "conditions");
  }
  if (config.color_ramp.stop_count == 1) {
    return reject(failure_, ValidationError::invalid_widget, "color_ramp");
  }
  float previous = -std::numeric_limits<float>::infinity();
  for (std::size_t index = 0; index < config.color_ramp.stop_count; ++index) {
    const ColorStop& stop = config.color_ramp.stops[index];
    if (!std::isfinite(stop.at) || stop.at <= previous || !valid_color(stop.color)) {
      return reject(failure_, ValidationError::invalid_widget, "color_ramp");
    }
    previous = stop.at;
  }
  if (config.color_ramp.target < ColorRampTarget::content ||
      config.color_ramp.target > ColorRampTarget::border) {
    return reject(failure_, ValidationError::invalid_widget, "color_ramp");
  }
  if (config.condition_count == 0 && config.color_ramp.stop_count == 0) {
    return true;
  }
  if (!value_source(config.condition_source, "condition_source")) {
    return false;
  }
  for (std::size_t index = 0; index < config.condition_count; ++index) {
    const WidgetCondition& rule = config.conditions[index];
    if (rule.op < ConditionOperator::above || rule.op > ConditionOperator::not_equal ||
        !std::isfinite(rule.value) || !valid_optional_color(rule.color) ||
        !valid_optional_color(rule.background_color) || !valid_optional_color(rule.border_color)) {
      return reject(failure_, ValidationError::invalid_widget, "conditions");
    }
    if (const std::string_view out_of_range = schema::range_error(rule); !out_of_range.empty()) {
      return reject(failure_, ValidationError::invalid_widget, out_of_range);
    }
  }
  return true;
}

bool Validator::frame(const WidgetFrame& config) {
  if (!on_display(origin_x_, origin_y_, config.placement, profile_.display.width,
                  profile_.display.height)) {
    return reject(failure_, ValidationError::invalid_widget, "placement");
  }
  if (config.padding.left > profile_.display.width ||
      config.padding.right > profile_.display.width ||
      config.padding.top > profile_.display.height ||
      config.padding.bottom > profile_.display.height) {
    return reject(failure_, ValidationError::invalid_widget, "padding");
  }
  if (!valid_color(config.border.color)) {
    return reject(failure_, ValidationError::invalid_widget, "border");
  }
  if (const std::string_view out_of_range = schema::range_error(config); !out_of_range.empty()) {
    return reject(failure_, ValidationError::invalid_widget, out_of_range);
  }
  const int border_inset = 2 * config.border.width_px;
  const int frame_inset = 2 * config.background_inset_px + border_inset;
  if (frame_inset >= config.placement.width || frame_inset >= config.placement.height) {
    const bool border_alone =
        border_inset >= config.placement.width || border_inset >= config.placement.height;
    return reject(failure_, ValidationError::invalid_widget,
                  border_alone ? "border.width_px" : "background_inset_px");
  }
  const int padded_width = config.padding.left + config.padding.right + border_inset;
  const int padded_height = config.padding.top + config.padding.bottom + border_inset;
  if (padded_width >= config.placement.width || padded_height >= config.placement.height) {
    return reject(failure_, ValidationError::invalid_widget, "padding");
  }
  if (!valid_optional_color(config.background_grad_color) ||
      config.background_grad_dir < GradientDirection::horizontal ||
      config.background_grad_dir > GradientDirection::vertical) {
    return reject(failure_, ValidationError::invalid_widget, "background_grad_color");
  }
  if (config.fill_corners < FillCorners::rounded || config.fill_corners > FillCorners::square) {
    return reject(failure_, ValidationError::invalid_widget, "fill_corners");
  }
  if (!valid_optional_color(config.background_color)) {
    return reject(failure_, ValidationError::invalid_widget, "background_color");
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
  if (!value_binding_view(config.title.source.binding).empty()) {
    if (config.title.text.front() == '\0') {
      return reject(failure_, ValidationError::invalid_widget, "title.source");
    }
    if (!value_source(config.title.source, "title.source")) {
      return false;
    }
  }
  return conditions(config);
}

bool Validator::value_source(const ValueSourceConfiguration& config, const std::string_view path,
                             const ValidationError error) {
  if (!registry_.resolve(value_binding_view(config.binding)).valid() ||
      config.modifier_count > config.modifiers.size()) {
    return reject(failure_, error, path);
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

}
