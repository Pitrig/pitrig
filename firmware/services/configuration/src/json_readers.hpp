#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <span>
#include <string_view>

#include "application_configuration.hpp"
#include "cJSON.h"
#include "configuration_schema_generated.hpp"
#include "validation_failure.hpp"

namespace pitrig::configuration::json {

using KeyList = std::span<const std::string_view>;

void install_json_allocator();

[[nodiscard]] bool contains_null_escape(std::span<const std::uint8_t> input);

[[nodiscard]] inline const cJSON* member(const cJSON* const object, const char* const name) {
  return cJSON_GetObjectItemCaseSensitive(object, name);
}

[[nodiscard]] bool valid_object(const cJSON* object, KeyList allowed, std::string_view name,
                                ValidationFailure& failure);

[[nodiscard]] bool read_float(const cJSON* object, const char* key, float& output,
                              std::string_view name, ValidationFailure& failure);

[[nodiscard]] bool read_boolean(const cJSON* object, const char* key, bool& output,
                                std::string_view name, ValidationFailure& failure);

[[nodiscard]] bool read_color(const cJSON* object, const char* key, std::uint32_t& output,
                              std::string_view name, ValidationFailure& failure);

[[nodiscard]] bool parse_placement(const cJSON* object, WidgetPlacement& placement,
                                   ValidationFailure& failure);

[[nodiscard]] bool parse_font(const cJSON* object, font_assets::FontSpec& font,
                              ValidationFailure& failure);

[[nodiscard]] bool parse_optional_placement(const cJSON* object, WidgetPlacement& placement,
                                            ValidationFailure& failure);

[[nodiscard]] bool parse_optional_font(const cJSON* object, font_assets::FontSpec& font,
                                       ValidationFailure& failure);

[[nodiscard]] bool read_value_condition(const cJSON* rule, ValueCondition& parsed,
                                        std::string_view name, ValidationFailure& failure);

[[nodiscard]] bool read_indicator_segment(const cJSON* segment, IndicatorSegment& parsed,
                                          std::string_view name, ValidationFailure& failure);

[[nodiscard]] bool read_color_stop(const cJSON* stop, ColorStop& parsed, std::string_view name,
                                   ValidationFailure& failure);

template <typename Element, std::size_t Capacity, typename ReadElement>
[[nodiscard]] bool read_array(const cJSON* const object, const char* const key,
                              std::array<Element, Capacity>& destination, std::uint8_t& count,
                              const std::string_view name, const ValidationError error,
                              ValidationFailure& failure, ReadElement&& read_element,
                              const std::string_view rejected_key = {}) {
  const cJSON* const array = member(object, key);
  if (array == nullptr) {
    return true;
  }
  const int size = cJSON_IsArray(array) ? cJSON_GetArraySize(array) : -1;
  if (size < 0 || size > static_cast<int>(destination.size())) {
    return reject(failure, error, name, rejected_key);
  }
  for (int index = 0; index < size; ++index) {
    if (!read_element(cJSON_GetArrayItem(array, index), destination[index])) {
      return false;
    }
  }
  count = static_cast<std::uint8_t>(size);
  return true;
}

template <typename Integer>
[[nodiscard]] bool read_integer(const cJSON* const object, const char* const key, Integer& output,
                                const std::string_view name, ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble) ||
      std::trunc(value->valuedouble) != value->valuedouble ||
      value->valuedouble < static_cast<double>(std::numeric_limits<Integer>::lowest()) ||
      value->valuedouble > static_cast<double>(std::numeric_limits<Integer>::max())) {
    return reject(failure, ValidationError::malformed, name, key);
  }
  output = static_cast<Integer>(value->valuedouble);
  return true;
}

template <std::size_t Size>
[[nodiscard]] bool copy_text(const cJSON* const value, std::array<char, Size>& output) {
  if (!cJSON_IsString(value) || value->valuestring == nullptr) {
    return false;
  }
  const std::size_t size = std::strlen(value->valuestring);
  if (size >= output.size()) {
    return false;
  }
  output.fill('\0');
  std::copy_n(value->valuestring, size, output.begin());
  return true;
}

template <std::size_t Size>
[[nodiscard]] bool read_text(const cJSON* const object, const char* const key,
                             std::array<char, Size>& output, const std::string_view name,
                             ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  return copy_text(value, output) ? true : reject(failure, ValidationError::malformed, name, key);
}

template <typename Enum, typename FromName>
[[nodiscard]] bool read_enum(const cJSON* const object, const char* const key, Enum& output,
                             const FromName from_name, const std::string_view name,
                             ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsString(value) || value->valuestring == nullptr ||
      !from_name(std::string_view{value->valuestring}, output)) {
    return reject(failure, ValidationError::malformed, name, key);
  }
  return true;
}

}
