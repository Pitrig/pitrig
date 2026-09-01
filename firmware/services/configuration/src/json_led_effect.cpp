#include <cstdint>
#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_hardware.hpp"
#include "json_value_pipeline.hpp"

namespace simcore::configuration::json {
namespace {

constexpr std::string_view kName = "hardware.effects";

[[nodiscard]] bool parse_gate(const cJSON* const object, LedEffect& config,
                              ValidationFailure& failure) {
  return read_enum(object, "gate", config.gate, led_gate_from_name, kName,
                   failure) &&
         parse_value_source(object, "condition_source", config.condition_source,
                            kName, failure) &&
         read_array(object, "conditions", config.conditions,
                    config.condition_count, kName,
                    ValidationError::invalid_module, failure,
                    [&](const cJSON* const rule, ValueCondition& parsed) {
                      return valid_object(rule, schema::kValueConditionKeys,
                                          kName, failure) &&
                             read_enum(rule, "op", parsed.op,
                                       condition_operator_from_name, kName,
                                       failure) &&
                             read_float(rule, "value", parsed.value, kName,
                                        failure);
                    },
                    "conditions");
}

[[nodiscard]] bool parse_painting(const cJSON* const object, LedEffect& config,
                                  ValidationFailure& failure) {
  return read_color(object, "color", config.color, kName, failure) &&
         read_array(object, "stops", config.stops, config.stop_count, kName,
                    ValidationError::invalid_module, failure,
                    [&](const cJSON* const stop, ColorStop& parsed) {
                      return valid_object(stop, schema::kColorStopKeys, kName,
                                          failure) &&
                             read_float(stop, "at", parsed.at, kName, failure) &&
                             read_color(stop, "color", parsed.color, kName,
                                        failure);
                    },
                    "stops") &&
         read_array(object, "steps", config.steps, config.step_count, kName,
                    ValidationError::invalid_module, failure,
                    [&](const cJSON* const step, IndicatorSegment& parsed) {
                      return valid_object(step, schema::kIndicatorSegmentKeys,
                                          kName, failure) &&
                             read_float(step, "threshold", parsed.threshold,
                                        kName, failure) &&
                             read_color(step, "color", parsed.color, kName,
                                        failure);
                    },
                    "steps");
}

[[nodiscard]] bool parse_content(const cJSON* const object, LedEffect& config,
                                 ValidationFailure& failure) {
  return read_enum(object, "animation", config.animation,
                   led_animation_kind_from_name, kName, failure) &&
         read_integer(object, "speed_ms", config.speed_ms, kName, failure) &&
         read_text(object, "sprite", config.sprite, kName, failure) &&
         read_integer(object, "sprite_frame", config.sprite_frame, kName,
                      failure) &&
         read_boolean(object, "sprite_loop", config.sprite_loop, kName,
                      failure) &&
         read_text(object, "text", config.text, kName, failure) &&
         read_enum(object, "font", config.font, led_font_from_name, kName,
                   failure);
}

}

bool parse_led_effect(const cJSON* const object, LedEffect& config,
                      ValidationFailure& failure) {
  if (!valid_object(object, schema::kLedEffectKeys, kName, failure) ||
      !read_enum(object, "type", config.type, led_effect_type_from_name, kName,
                 failure) ||
      !read_text(object, "id", config.id, kName, failure) ||
      !read_integer(object, "from", config.from, kName, failure) ||
      !read_integer(object, "count", config.count, kName, failure) ||
      !read_text(object, "panel_mask", config.panel_mask, kName, failure) ||
      !parse_value_source(object, "source", config.source, kName, failure) ||
      !read_float(object, "minimum", config.range.minimum, kName, failure) ||
      !read_float(object, "maximum", config.range.maximum, kName, failure) ||
      !parse_gate(object, config, failure) ||
      !read_integer(object, "hold_ms", config.hold_ms, kName, failure) ||
      !read_integer(object, "blink_ms", config.blink_ms, kName, failure) ||
      !read_boolean(object, "mirrored", config.mirrored, kName, failure) ||
      !read_boolean(object, "inverted", config.inverted, kName, failure)) {
    return false;
  }
  return parse_painting(object, config, failure) &&
         parse_content(object, config, failure);
}

}
