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
#include "configuration_schema_generated.hpp"
#include "cJSON.h"

// Generic readers over one cJSON object: the scalar kinds the schema declares,
// the property allow-list every object is checked against, and the two shapes
// (placement, font) that appear at more than one level. Everything above this
// reads a document through these, so the rules about what a malformed value is
// live in one place.

namespace simcore::configuration::json {

using KeyList = std::span<const std::string_view>;

// Points cJSON's allocator at external memory. Idempotent.
void install_json_allocator();

// Records the first cause and leaves it untouched afterwards, so a nested
// rejection is reported instead of the generic error its caller would return.
bool reject(ValidationFailure& failure, ValidationError error,
            std::string_view object, std::string_view key = {});

[[nodiscard]] inline const cJSON* member(const cJSON* const object,
                                         const char* const name) {
  return cJSON_GetObjectItemCaseSensitive(object, name);
}

// Rejects any property the schema does not declare, and any property that
// appears twice in the same object.
[[nodiscard]] bool valid_object(const cJSON* object, KeyList allowed,
                                std::string_view name,
                                ValidationFailure& failure);

[[nodiscard]] bool read_float(const cJSON* object, const char* key,
                              float& output, std::string_view name,
                              ValidationFailure& failure);

[[nodiscard]] bool read_boolean(const cJSON* object, const char* key,
                                bool& output, std::string_view name,
                                ValidationFailure& failure);

[[nodiscard]] bool read_color(const cJSON* object, const char* key,
                              std::uint32_t& output, std::string_view name,
                              ValidationFailure& failure);

[[nodiscard]] bool parse_placement(const cJSON* object,
                                   WidgetPlacement& placement,
                                   ValidationFailure& failure);

[[nodiscard]] bool parse_font(const cJSON* object, font_assets::FontSpec& font,
                              ValidationFailure& failure);

[[nodiscard]] bool parse_optional_placement(const cJSON* object,
                                            WidgetPlacement& placement,
                                            ValidationFailure& failure);

[[nodiscard]] bool parse_optional_font(const cJSON* object,
                                       font_assets::FontSpec& font,
                                       ValidationFailure& failure);

template <typename Integer>
[[nodiscard]] bool read_integer(const cJSON* const object,
                                const char* const key, Integer& output,
                                const std::string_view name,
                                ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble) ||
      std::trunc(value->valuedouble) != value->valuedouble ||
      value->valuedouble <
          static_cast<double>(std::numeric_limits<Integer>::lowest()) ||
      value->valuedouble >
          static_cast<double>(std::numeric_limits<Integer>::max())) {
    return reject(failure, ValidationError::malformed, name, key);
  }
  output = static_cast<Integer>(value->valuedouble);
  return true;
}

template <std::size_t Size>
[[nodiscard]] bool copy_text(const cJSON* const value,
                             std::array<char, Size>& output) {
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
[[nodiscard]] bool read_text(const cJSON* const object,
                             const char* const key,
                             std::array<char, Size>& output,
                             const std::string_view name,
                             ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  return copy_text(value, output)
             ? true
             : reject(failure, ValidationError::malformed, name, key);
}

// Decodes one of the generated wire spellings for a schema enumeration.
template <typename Enum, typename FromName>
[[nodiscard]] bool read_enum(const cJSON* const object,
                             const char* const key, Enum& output,
                             const FromName from_name,
                             const std::string_view name,
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

}  // namespace simcore::configuration::json
