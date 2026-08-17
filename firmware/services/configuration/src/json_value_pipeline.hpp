#pragma once

#include <cstdint>
#include <string_view>

#include "application_configuration.hpp"
#include "json_readers.hpp"
#include "cJSON.h"

// The value pipeline as it appears in a document: the sources a widget reads,
// the transform each one carries, the rules it restyles by, and the frame every
// widget type shares. Nothing here knows which widget type it is filling.
namespace simcore::configuration::json {

// Shared by a widget source and by the source its styling rules watch: the two
// carry the same bounded modifier list.
template <typename Source>
[[nodiscard]] bool parse_modifiers(const cJSON* const object, Source& config,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text.source.modifiers";
  const cJSON* const modifiers = member(object, "modifiers");
  if (modifiers == nullptr) {
    return true;
  }
  if (!cJSON_IsArray(modifiers) ||
      cJSON_GetArraySize(modifiers) >
          static_cast<int>(config.modifiers.size())) {
    return reject(failure, ValidationError::malformed, kName);
  }
  const int count = cJSON_GetArraySize(modifiers);
  for (int index = 0; index < count; ++index) {
    const cJSON* const modifier = cJSON_GetArrayItem(modifiers, index);
    if (!valid_object(modifier, schema::kValueModifierKeys, kName, failure) ||
        !read_enum(modifier, "type", config.modifiers[index].type,
                   value_modifier_type_from_name, kName, failure)) {
      return false;
    }
  }
  config.modifier_count = static_cast<std::uint8_t>(count);
  return true;
}

[[nodiscard]] bool parse_transform(const cJSON* object,
                                   ValueTransform& transform,
                                   ValidationFailure& failure);

// A widget renders its sources in authored order, so the array is the widget's
// value pipeline rather than a set.
[[nodiscard]] bool parse_sources(const cJSON* object,
                                 TextWidgetConfiguration& config,
                                 ValidationFailure& failure);

// Navigation a tap performs. Optional everywhere it appears; without it the
// object keeps refusing input, which is what every widget did before actions
// existed. The target screen stays a name here — the composition resolves it
// once, so a tap looks nothing up.
[[nodiscard]] bool parse_action(const cJSON* object, WidgetAction& action,
                                std::string_view name,
                                ValidationFailure& failure);

// Every widget type carries a frame, so this reads the properties none of them
// has to declare for itself.
[[nodiscard]] bool parse_frame(const cJSON* object, WidgetFrame& frame,
                               std::string_view name,
                               ValidationFailure& failure);

[[nodiscard]] bool parse_value_source(const cJSON* object,
                                      ValueSourceConfiguration& config,
                                      std::string_view name,
                                      ValidationFailure& failure);

}  // namespace simcore::configuration::json
