#include "validation/hardware_rules.hpp"

#include <string_view>

#include "validation/value_rules.hpp"

namespace pitrig::configuration::validation {
namespace {

[[nodiscard]] bool duplicate_pin(const ApplicationConfiguration& configuration,
                                 const std::size_t upto, const int pin) {
  for (std::size_t index = 0; index < upto; ++index) {
    if (configuration.hardware[index].pin == pin) {
      return true;
    }
  }
  return false;
}

[[nodiscard]] bool duplicate_id(const ApplicationConfiguration& configuration,
                                const std::size_t upto, const std::string_view id) {
  for (std::size_t index = 0; index < upto; ++index) {
    if (text_view(configuration.hardware[index].id) == id) {
      return true;
    }
  }
  return false;
}

[[nodiscard]] bool validate_sprite(const HardwareDeviceConfiguration& device,
                                   const std::uint8_t index, ValidationFailure& failure) {
  const LedSpriteConfiguration& sprite = device.sprites[index];
  if (const std::string_view out_of_range = schema::range_error(sprite); !out_of_range.empty()) {
    return reject(failure, ValidationError::invalid_led_sprite, out_of_range);
  }
  const std::string_view id = text_view(sprite.id);
  if (id.empty() || sprite.palette_count == 0) {
    return reject(failure, ValidationError::invalid_led_sprite, "hardware.sprites");
  }
  for (std::uint8_t other = 0; other < index; ++other) {
    if (text_view(device.sprites[other].id) == id) {
      return reject(failure, ValidationError::invalid_led_sprite, "hardware.sprites.id");
    }
  }
  const std::string_view pixels = text_view(sprite.pixels);
  const std::size_t expected =
      static_cast<std::size_t>(sprite.width) * sprite.height * sprite.frame_count;
  if (pixels.size() != expected) {
    return reject(failure, ValidationError::invalid_led_sprite, "hardware.sprites.pixels");
  }
  for (const char digit : pixels) {
    if (led_palette_digit(digit) < 0) {
      return reject(failure, ValidationError::invalid_led_sprite, "hardware.sprites.pixels");
    }
  }
  return true;
}

[[nodiscard]] bool validate_device(const ApplicationConfiguration& configuration,
                                   const ValidationContext& profile, const std::size_t index,
                                   std::size_t& lamps, ValidationFailure& failure) {
  const HardwareDeviceConfiguration& device = configuration.hardware[index];
  if (!profile.led.offers(device.pin) || duplicate_pin(configuration, index, device.pin)) {
    return reject(failure, ValidationError::invalid_led_pin, "hardware.pin");
  }
  if (const std::string_view id = text_view(device.id);
      !id.empty() && duplicate_id(configuration, index, id)) {
    return reject(failure, ValidationError::invalid_hardware, "hardware.id");
  }
  if (const std::string_view out_of_range = schema::range_error(device); !out_of_range.empty()) {
    return reject(failure, ValidationError::invalid_hardware, out_of_range);
  }
  const bool matrix = device.type == HardwareDeviceType::rgb_matrix;
  if (matrix && device.rotation_deg % 90 != 0) {
    return reject(failure, ValidationError::invalid_hardware, "rotation_deg");
  }
  if (!matrix && device.sprite_count != 0) {
    return reject(failure, ValidationError::invalid_hardware, "hardware.sprites");
  }
  if (matrix && device.segment_count != 0) {
    return reject(failure, ValidationError::invalid_hardware, "hardware.segments");
  }
  std::size_t arranged = 0;
  for (std::uint8_t segment = 0; segment < device.segment_count; ++segment) {
    if (const std::string_view out_of_range = schema::range_error(device.segments[segment]);
        !out_of_range.empty()) {
      return reject(failure, ValidationError::invalid_hardware, out_of_range);
    }
    arranged += device.segments[segment].count;
  }
  if (device.segment_count != 0 && arranged != device.count) {
    return reject(failure, ValidationError::invalid_hardware, "hardware.segments");
  }
  lamps = led_device_lamps(device);
  if (lamps == 0 || lamps > kMaximumLedsPerOutput) {
    return reject(failure, ValidationError::invalid_hardware, "hardware");
  }
  for (std::uint8_t sprite = 0; sprite < device.sprite_count; ++sprite) {
    if (!validate_sprite(device, sprite, failure)) {
      return false;
    }
  }
  return validate_led_effects(device, failure);
}

}

bool validate_hardware(const ApplicationConfiguration& configuration,
                       const ValidationContext& profile, ValidationFailure& failure) {
  if (configuration.device_count > configuration.hardware.size() ||
      configuration.device_count > profile.led.max_outputs) {
    return reject(failure, ValidationError::invalid_hardware, "hardware");
  }
  std::size_t total = 0;
  for (std::size_t index = 0; index < configuration.device_count; ++index) {
    std::size_t lamps = 0;
    if (!validate_device(configuration, profile, index, lamps, failure)) {
      return false;
    }
    total += lamps;
  }
  return total <= kMaximumLedsTotal
             ? true
             : reject(failure, ValidationError::invalid_hardware, "hardware");
}

}
