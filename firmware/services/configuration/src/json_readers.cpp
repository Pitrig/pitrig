#include "json_readers.hpp"

#include <cstdlib>

#include "esp_heap_caps.h"

namespace pitrig::configuration::json {
namespace {

void* json_malloc(const std::size_t size) {
  void* const external = heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  return external != nullptr ? external : std::malloc(size);
}

void json_free(void* const pointer) { heap_caps_free(pointer); }

}

void install_json_allocator() {
  static bool installed = false;
  if (installed) {
    return;
  }
  cJSON_Hooks hooks{.malloc_fn = &json_malloc, .free_fn = &json_free};
  cJSON_InitHooks(&hooks);
  installed = true;
}

[[nodiscard]] bool contains_null_escape(const std::span<const std::uint8_t> input) {
  constexpr std::string_view kZeros = "0000";
  bool inside = false;
  for (std::size_t index = 0; index < input.size(); ++index) {
    const char character = static_cast<char>(input[index]);
    if (!inside) {
      inside = character == '"';
      continue;
    }
    if (character == '"') {
      inside = false;
      continue;
    }
    if (character != '\\' || index + 1 >= input.size()) {
      continue;
    }
    ++index;
    if (input[index] != 'u' || index + kZeros.size() >= input.size()) {
      continue;
    }
    if (std::equal(kZeros.begin(), kZeros.end(), input.begin() + index + 1)) {
      return true;
    }
  }
  return false;
}

[[nodiscard]] bool valid_object(const cJSON* const object, const KeyList allowed,
                                const std::string_view name, ValidationFailure& failure) {
  if (!cJSON_IsObject(object)) {
    return reject(failure, ValidationError::malformed, name);
  }
  for (const cJSON* item = object->child; item != nullptr; item = item->next) {
    if (item->string == nullptr) {
      return reject(failure, ValidationError::malformed, name);
    }
    const std::string_view key{item->string};
    if (std::find(allowed.begin(), allowed.end(), key) == allowed.end()) {
      return reject(failure, ValidationError::unknown_property, name, key);
    }
    for (const cJSON* previous = object->child; previous != item; previous = previous->next) {
      if (previous->string != nullptr && key == previous->string) {
        return reject(failure, ValidationError::duplicate_property, name, key);
      }
    }
  }
  return true;
}

constexpr double kMaximumRealMagnitude = 1.0e9;

[[nodiscard]] bool read_float(const cJSON* const object, const char* const key, float& output,
                              const std::string_view name, ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble) ||
      std::abs(value->valuedouble) > kMaximumRealMagnitude) {
    return reject(failure, ValidationError::malformed, name, key);
  }
  output = static_cast<float>(value->valuedouble);
  return true;
}

[[nodiscard]] bool read_boolean(const cJSON* const object, const char* const key, bool& output,
                                const std::string_view name, ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsBool(value)) {
    return reject(failure, ValidationError::malformed, name, key);
  }
  output = cJSON_IsTrue(value);
  return true;
}

[[nodiscard]] bool read_color(const cJSON* const object, const char* const key,
                              std::uint32_t& output, const std::string_view name,
                              ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsString(value) || value->valuestring == nullptr ||
      std::strlen(value->valuestring) != 7 || value->valuestring[0] != '#') {
    return reject(failure, ValidationError::malformed, name, key);
  }
  std::uint32_t color{};
  for (std::size_t index = 1; index < 7; ++index) {
    const int nibble = led_palette_digit(value->valuestring[index]);
    if (nibble < 0) {
      return reject(failure, ValidationError::malformed, name, key);
    }
    color = (color << 4U) | static_cast<std::uint32_t>(nibble);
  }
  output = color;
  return true;
}

[[nodiscard]] bool parse_placement(const cJSON* const object, WidgetPlacement& placement,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "placement";
  return valid_object(object, schema::kWidgetPlacementKeys, kName, failure) &&
         read_integer(object, "x", placement.x, kName, failure) &&
         read_integer(object, "y", placement.y, kName, failure) &&
         read_integer(object, "width", placement.width, kName, failure) &&
         read_integer(object, "height", placement.height, kName, failure);
}

[[nodiscard]] bool parse_font(const cJSON* const object, font_assets::FontSpec& font,
                              ValidationFailure& failure) {
  constexpr std::string_view kName = "font";
  if (!valid_object(object, schema::kFontSpecKeys, kName, failure) ||
      !read_integer(object, "size_px", font.size_px, kName, failure)) {
    return false;
  }
  if (const cJSON* const fallback = member(object, "fallback");
      fallback != nullptr && !copy_text(fallback, font.fallback)) {
    return reject(failure, ValidationError::malformed, kName, "fallback");
  }
  const cJSON* const family = member(object, "family");
  if (family == nullptr) {
    return true;
  }
  return copy_text(family, font.family)
             ? true
             : reject(failure, ValidationError::malformed, kName, "family");
}

[[nodiscard]] bool parse_optional_placement(const cJSON* const object, WidgetPlacement& placement,
                                            ValidationFailure& failure) {
  const cJSON* const value = member(object, "placement");
  return value == nullptr || parse_placement(value, placement, failure);
}

[[nodiscard]] bool parse_optional_font(const cJSON* const object, font_assets::FontSpec& font,
                                       ValidationFailure& failure) {
  const cJSON* const value = member(object, "font");
  return value == nullptr || parse_font(value, font, failure);
}

[[nodiscard]] bool read_value_condition(const cJSON* const rule, ValueCondition& parsed,
                                        const std::string_view name, ValidationFailure& failure) {
  return valid_object(rule, schema::kValueConditionKeys, name, failure) &&
         read_enum(rule, "op", parsed.op, condition_operator_from_name, name, failure) &&
         read_float(rule, "value", parsed.value, name, failure);
}

[[nodiscard]] bool read_indicator_segment(const cJSON* const segment, IndicatorSegment& parsed,
                                          const std::string_view name, ValidationFailure& failure) {
  return valid_object(segment, schema::kIndicatorSegmentKeys, name, failure) &&
         read_float(segment, "threshold", parsed.threshold, name, failure) &&
         read_color(segment, "color", parsed.color, name, failure);
}

[[nodiscard]] bool read_color_stop(const cJSON* const stop, ColorStop& parsed,
                                   const std::string_view name, ValidationFailure& failure) {
  return valid_object(stop, schema::kColorStopKeys, name, failure) &&
         read_float(stop, "at", parsed.at, name, failure) &&
         read_color(stop, "color", parsed.color, name, failure);
}

}
