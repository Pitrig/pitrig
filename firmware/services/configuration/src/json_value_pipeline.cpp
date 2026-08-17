#include "json_value_pipeline.hpp"

namespace simcore::configuration::json {
namespace {

// Styling rules and the source they watch. Both are optional; a widget with
// neither renders its authored colours and nothing evaluates at render time.
// The ramp sits beside the rules because both read the same watched source; it
// is the colour they fall back to rather than a rule of its own.
[[nodiscard]] bool parse_color_ramp(const cJSON* const object,
                                    WidgetFrame& config,
                                    ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.color_ramp";
  const cJSON* const ramp = member(object, "color_ramp");
  if (ramp == nullptr) {
    return true;
  }
  if (!valid_object(ramp, schema::kColorRampKeys, kName, failure) ||
      !read_enum(ramp, "target", config.color_ramp.target,
                 color_ramp_target_from_name, kName, failure)) {
    return false;
  }
  const cJSON* const stops = member(ramp, "stops");
  if (stops == nullptr) {
    return true;
  }
  const int count = cJSON_IsArray(stops) ? cJSON_GetArraySize(stops) : -1;
  if (count < 0 || count > static_cast<int>(config.color_ramp.stops.size())) {
    return reject(failure, ValidationError::malformed, kName);
  }
  for (int index = 0; index < count; ++index) {
    const cJSON* const stop = cJSON_GetArrayItem(stops, index);
    ColorStop& parsed = config.color_ramp.stops[index];
    if (!valid_object(stop, schema::kColorStopKeys, kName, failure) ||
        !read_float(stop, "at", parsed.at, kName, failure) ||
        !read_color(stop, "color", parsed.color, kName, failure)) {
      return false;
    }
  }
  config.color_ramp.stop_count = static_cast<std::uint8_t>(count);
  return true;
}

[[nodiscard]] bool parse_conditions(const cJSON* const object,
                                    WidgetFrame& config,
                                    ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.conditions";
  if (const cJSON* const source = member(object, "condition_source");
      source != nullptr) {
    constexpr std::string_view kSourceName = "widget.condition_source";
    if (!valid_object(source, schema::kValueSourceConfigurationKeys,
                      kSourceName, failure) ||
        !read_text(source, "binding", config.condition_source.binding,
                   kSourceName, failure) ||
        !parse_modifiers(source, config.condition_source, failure)) {
      return false;
    }
  }

  if (!parse_color_ramp(object, config, failure)) {
    return false;
  }

  const cJSON* const conditions = member(object, "conditions");
  if (conditions == nullptr) {
    return true;
  }
  const int count =
      cJSON_IsArray(conditions) ? cJSON_GetArraySize(conditions) : -1;
  if (count < 0 || count > static_cast<int>(config.conditions.size())) {
    return reject(failure, ValidationError::malformed, kName);
  }
  for (int index = 0; index < count; ++index) {
    const cJSON* const rule = cJSON_GetArrayItem(conditions, index);
    WidgetCondition& parsed = config.conditions[index];
    if (!valid_object(rule, schema::kWidgetConditionKeys, kName, failure) ||
        !read_enum(rule, "op", parsed.op, condition_operator_from_name, kName,
                   failure) ||
        !read_float(rule, "value", parsed.value, kName, failure) ||
        !read_color(rule, "color", parsed.color, kName, failure) ||
        !read_color(rule, "background_color", parsed.background_color, kName,
                    failure) ||
        !read_color(rule, "border_color", parsed.border_color, kName,
                    failure) ||
        !read_boolean(rule, "hidden", parsed.hidden, kName, failure) ||
        !read_integer(rule, "blink_ms", parsed.blink_ms, kName, failure) ||
        !read_integer(rule, "hold_ms", parsed.hold_ms, kName, failure)) {
      return false;
    }
  }
  config.condition_count = static_cast<std::uint8_t>(count);
  return true;
}

}  // namespace

[[nodiscard]] bool parse_transform(const cJSON* const object,
                                   ValueTransform& transform,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text.transform";
  if (!valid_object(object, schema::kValueTransformKeys, kName, failure) ||
      !read_enum(object, "type", transform.type, value_transform_type_from_name,
                 kName, failure) ||
      !read_text(object, "prefix", transform.prefix, kName, failure) ||
      !read_text(object, "suffix", transform.suffix, kName, failure)) {
    return false;
  }
  if (transform.type == ValueTransformType::number) {
    return read_integer(object, "decimals", transform.number.decimals, kName,
                        failure) &&
           read_float(object, "scale", transform.number.scale, kName,
                      failure) &&
           read_float(object, "offset", transform.number.offset, kName,
                      failure);
  }
  if (transform.type != ValueTransformType::time) {
    return true;
  }
  const cJSON* const format = member(object, "format");
  if (!cJSON_IsString(format) || format->valuestring == nullptr) {
    return reject(failure, ValidationError::malformed, kName, "format");
  }
  const std::string_view value{format->valuestring};
  if (value == "duration_ms") {
    transform.time.format = transformers::time_transform::Format::duration_ms;
  } else if (value == "signed_duration_ms") {
    transform.time.format =
        transformers::time_transform::Format::signed_duration_ms;
  } else {
    return reject(failure, ValidationError::malformed, kName, "format");
  }
  return true;
}

[[nodiscard]] bool parse_sources(const cJSON* const object,
                                 TextWidgetConfiguration& config,
                                 ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text.sources";
  const cJSON* const sources = member(object, "sources");
  if (sources == nullptr) {
    return reject(failure, ValidationError::malformed, kName);
  }
  const int count = cJSON_IsArray(sources) ? cJSON_GetArraySize(sources) : -1;
  if (count <= 0 || count > static_cast<int>(config.sources.size())) {
    return reject(failure, ValidationError::malformed, kName);
  }
  for (int index = 0; index < count; ++index) {
    const cJSON* const source = cJSON_GetArrayItem(sources, index);
    TextSourceConfiguration& parsed = config.sources[index];
    if (!valid_object(source, schema::kTextSourceConfigurationKeys, kName,
                      failure) ||
        !read_text(source, "binding", parsed.binding, kName, failure) ||
        !parse_modifiers(source, parsed, failure)) {
      return false;
    }
    if (const cJSON* const transform = member(source, "transform");
        transform != nullptr &&
        !parse_transform(transform, parsed.transform, failure)) {
      return false;
    }
  }
  config.source_count = static_cast<std::uint8_t>(count);
  return true;
}

[[nodiscard]] bool parse_action(const cJSON* const object,
                                WidgetAction& action,
                                const std::string_view name,
                                ValidationFailure& failure) {
  const cJSON* const value = member(object, "action");
  if (value == nullptr) {
    return true;
  }
  return valid_object(value, schema::kWidgetActionKeys, name, failure) &&
         read_enum(value, "type", action.type, widget_action_type_from_name,
                   name, failure) &&
         read_text(value, "screen", action.screen, name, failure);
}

[[nodiscard]] bool parse_frame(const cJSON* const object, WidgetFrame& frame,
                               const std::string_view name,
                               ValidationFailure& failure) {
  if (!read_text(object, "id", frame.id, name, failure) ||
      !parse_optional_placement(object, frame.placement, failure) ||
      !read_integer(object, "z_index", frame.z_index, name, failure) ||
      !read_color(object, "background_color", frame.background_color, name,
                  failure) ||
      !read_color(object, "background_grad_color", frame.background_grad_color,
                  name, failure) ||
      !read_enum(object, "background_grad_dir", frame.background_grad_dir,
                 gradient_direction_from_name, name, failure) ||
      !read_integer(object, "background_inset_px", frame.background_inset_px,
                    name, failure) ||
      !parse_action(object, frame.action, "widget.action", failure) ||
      !parse_conditions(object, frame, failure)) {
    return false;
  }

  if (const cJSON* const padding = member(object, "padding");
      padding != nullptr) {
    constexpr std::string_view kPaddingName = "widget.padding";
    if (!valid_object(padding, schema::kWidgetInsetsKeys, kPaddingName,
                      failure) ||
        !read_integer(padding, "left", frame.padding.left, kPaddingName,
                      failure) ||
        !read_integer(padding, "top", frame.padding.top, kPaddingName,
                      failure) ||
        !read_integer(padding, "right", frame.padding.right, kPaddingName,
                      failure) ||
        !read_integer(padding, "bottom", frame.padding.bottom, kPaddingName,
                      failure)) {
      return false;
    }
  }

  if (const cJSON* const title = member(object, "title"); title != nullptr) {
    constexpr std::string_view kTitleName = "widget.title";
    if (!valid_object(title, schema::kWidgetTitleStyleKeys, kTitleName,
                      failure) ||
        !read_text(title, "text", frame.title.text, kTitleName, failure) ||
        !parse_optional_font(title, frame.title.font, failure) ||
        !read_color(title, "color", frame.title.color, kTitleName, failure) ||
        !read_enum(title, "alignment", frame.title.alignment,
                   text_alignment_from_name, kTitleName, failure) ||
        !read_integer(title, "offset_x_px", frame.title.offset_x_px, kTitleName,
                      failure) ||
        !read_integer(title, "offset_y_px", frame.title.offset_y_px, kTitleName,
                      failure) ||
        !read_boolean(title, "border_gap", frame.title.border_gap, kTitleName,
                      failure) ||
        !read_integer(title, "gap_padding_px", frame.title.gap_padding_px,
                      kTitleName, failure)) {
      return false;
    }
  }

  if (const cJSON* const border = member(object, "border"); border != nullptr) {
    constexpr std::string_view kBorderName = "widget.border";
    if (!valid_object(border, schema::kWidgetBorderKeys, kBorderName,
                      failure) ||
        !read_color(border, "color", frame.border.color, kBorderName,
                    failure) ||
        !read_integer(border, "width_px", frame.border.width_px, kBorderName,
                      failure) ||
        !read_integer(border, "radius_px", frame.border.radius_px, kBorderName,
                      failure)) {
      return false;
    }
  }
  return true;
}

[[nodiscard]] bool parse_value_source(const cJSON* const object,
                                     ValueSourceConfiguration& config,
                                     const std::string_view name,
                                     ValidationFailure& failure) {
  const cJSON* const source = member(object, "source");
  if (source == nullptr) {
    return true;
  }
  return valid_object(source, schema::kValueSourceConfigurationKeys, name,
                      failure) &&
         read_text(source, "binding", config.binding, name, failure) &&
         parse_modifiers(source, config, failure);
}

}  // namespace simcore::configuration::json
