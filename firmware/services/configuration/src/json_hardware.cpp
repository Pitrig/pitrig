#include "json_hardware.hpp"

#include <cstdint>
#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_value_pipeline.hpp"

namespace simcore::configuration::json {
namespace {

constexpr std::string_view kDeviceName = "hardware";
constexpr std::string_view kSpriteName = "hardware.sprites";
constexpr std::string_view kSegmentName = "hardware.segments";

[[nodiscard]] bool parse_segment(const cJSON* const object,
                                 LedSegmentConfiguration& config,
                                 ValidationFailure& failure) {
  return valid_object(object, schema::kLedSegmentConfigurationKeys,
                      kSegmentName, failure) &&
         read_integer(object, "count", config.count, kSegmentName, failure) &&
         read_enum(object, "direction", config.direction,
                   led_segment_direction_from_name, kSegmentName, failure);
}

[[nodiscard]] bool parse_sprite(const cJSON* const object,
                                LedSpriteConfiguration& config,
                                ValidationFailure& failure) {
  if (!valid_object(object, schema::kLedSpriteConfigurationKeys, kSpriteName,
                    failure) ||
      !read_text(object, "id", config.id, kSpriteName, failure) ||
      !read_integer(object, "width", config.width, kSpriteName, failure) ||
      !read_integer(object, "height", config.height, kSpriteName, failure) ||
      !read_integer(object, "frame_count", config.frame_count, kSpriteName,
                    failure) ||
      !read_text(object, "pixels", config.pixels, kSpriteName, failure)) {
    return false;
  }
  return read_array(
      object, "palette", config.palette, config.palette_count, kSpriteName,
      ValidationError::invalid_led_sprite, failure,
      [&](const cJSON* const entry, LedPaletteEntry& parsed) {
        return valid_object(entry, schema::kLedPaletteEntryKeys, kSpriteName,
                            failure) &&
               read_color(entry, "color", parsed.color, kSpriteName, failure);
      },
      "palette");
}

[[nodiscard]] bool parse_device(const cJSON* const object,
                                HardwareDeviceConfiguration& config,
                                ValidationFailure& failure) {
  if (!valid_object(object, schema::kHardwareDeviceConfigurationKeys,
                    kDeviceName, failure)) {
    return false;
  }
  const cJSON* const type = member(object, "type");
  if (type == nullptr || !cJSON_IsString(type) || type->valuestring == nullptr ||
      !hardware_device_type_from_name(std::string_view{type->valuestring},
                                      config.type)) {
    return reject(failure, ValidationError::invalid_hardware, kDeviceName,
                  "type");
  }
  if (!read_text(object, "id", config.id, kDeviceName, failure) ||
      !read_integer(object, "pin", config.pin, kDeviceName, failure) ||
      !read_integer(object, "count", config.count, kDeviceName, failure) ||
      !read_array(object, "segments", config.segments, config.segment_count,
                  kDeviceName, ValidationError::invalid_hardware, failure,
                  [&](const cJSON* const entry,
                      LedSegmentConfiguration& parsed) {
                    return parse_segment(entry, parsed, failure);
                  },
                  "segments") ||
      !read_integer(object, "width", config.width, kDeviceName, failure) ||
      !read_integer(object, "height", config.height, kDeviceName, failure) ||
      !read_enum(object, "order", config.order, matrix_order_from_name,
                 kDeviceName, failure) ||
      !read_enum(object, "origin", config.origin, matrix_origin_from_name,
                 kDeviceName, failure) ||
      !read_integer(object, "rotation_deg", config.rotation_deg, kDeviceName,
                    failure) ||
      !read_enum(object, "chip", config.chip, led_chip_from_name, kDeviceName,
                 failure) ||
      !read_integer(object, "brightness", config.brightness, kDeviceName,
                    failure) ||
      !read_boolean(object, "gamma", config.gamma, kDeviceName, failure) ||
      !read_integer(object, "current_limit_ma", config.current_limit_ma,
                    kDeviceName, failure)) {
    return false;
  }
  return read_array(object, "sprites", config.sprites, config.sprite_count,
                    kDeviceName, ValidationError::invalid_led_sprite, failure,
                    [&](const cJSON* const entry,
                        LedSpriteConfiguration& parsed) {
                      return parse_sprite(entry, parsed, failure);
                    },
                    "sprites") &&
         read_array(object, "effects", config.effects, config.effect_count,
                    kDeviceName, ValidationError::invalid_module, failure,
                    [&](const cJSON* const entry, LedEffect& parsed) {
                      return parse_led_effect(entry, parsed, failure);
                    },
                    "effects");
}

}

bool parse_hardware(const cJSON* const array,
                    ApplicationConfiguration& configuration,
                    ValidationFailure& failure) {
  const int size = cJSON_IsArray(array) ? cJSON_GetArraySize(array) : -1;
  if (size < 0 ||
      size > static_cast<int>(configuration.hardware.size())) {
    return reject(failure, ValidationError::invalid_hardware, kDeviceName);
  }
  for (int index = 0; index < size; ++index) {
    if (!parse_device(cJSON_GetArrayItem(array, index),
                      configuration.hardware[index], failure)) {
      return false;
    }
  }
  configuration.device_count = static_cast<std::uint8_t>(size);
  return true;
}

}
