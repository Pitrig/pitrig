#include <string_view>

#include "validation/hardware_rules.hpp"
#include "validation/value_rules.hpp"

namespace simcore::configuration::validation {
namespace {

[[nodiscard]] bool validate_gate(const LedEffect& effect,
                                 ValidationFailure& failure) {
  const bool gated = effect.gate == LedGate::conditions;
  const bool watched = !text_view(effect.condition_source.binding).empty();
  if (gated != watched || (gated && effect.condition_count == 0)) {
    return reject(failure, ValidationError::invalid_module,
                  "hardware.effects.condition_source");
  }
  return true;
}

[[nodiscard]] const LedSpriteConfiguration* named_sprite(
    const HardwareDeviceConfiguration& device, const std::string_view id) {
  for (std::uint8_t index = 0; index < device.sprite_count; ++index) {
    if (text_view(device.sprites[index].id) == id) {
      return &device.sprites[index];
    }
  }
  return nullptr;
}

[[nodiscard]] bool validate_content(const HardwareDeviceConfiguration& device,
                                    const LedEffect& effect,
                                    ValidationFailure& failure) {
  switch (effect.type) {
    case LedEffectType::gradient:
      return effect.stop_count >= 2
                 ? true
                 : reject(failure, ValidationError::invalid_module,
                          "hardware.effects.stops");
    case LedEffectType::steps:
      return effect.step_count >= 1
                 ? true
                 : reject(failure, ValidationError::invalid_module,
                          "hardware.effects.steps");
    case LedEffectType::gauge:
      return effect.stop_count != 1
                 ? true
                 : reject(failure, ValidationError::invalid_module,
                          "hardware.effects.stops");
    case LedEffectType::sprite: {
      const LedSpriteConfiguration* const sprite =
          named_sprite(device, text_view(effect.sprite));
      if (sprite == nullptr) {
        return reject(failure, ValidationError::invalid_led_sprite,
                      "hardware.effects.sprite");
      }
      return effect.sprite_frame < sprite->frame_count
                 ? true
                 : reject(failure, ValidationError::invalid_led_sprite,
                          "hardware.effects.sprite_frame");
    }
    case LedEffectType::text:
      return !text_view(effect.text).empty() ||
                     !text_view(effect.source.binding).empty()
                 ? true
                 : reject(failure, ValidationError::invalid_module,
                          "hardware.effects.text");
    default:
      return true;
  }
}

[[nodiscard]] bool validate_effect(const HardwareDeviceConfiguration& device,
                                   const LedEffect& effect,
                                   ValidationFailure& failure) {
  if (const std::string_view out_of_range = schema::range_error(effect);
      !out_of_range.empty()) {
    return reject(failure, ValidationError::invalid_module, out_of_range);
  }
  const std::size_t lamps = led_device_lamps(device);
  if (effect.from >= lamps ||
      (effect.count != 0 &&
       static_cast<std::size_t>(effect.from) + effect.count > lamps)) {
    return reject(failure, ValidationError::invalid_module,
                  "hardware.effects.from");
  }
  if (led_effect_draws_pixels(effect.type) &&
      device.type != HardwareDeviceType::rgb_matrix) {
    return reject(failure, ValidationError::invalid_module,
                  "hardware.effects.type");
  }
  if (effect.source.modifier_count != 0 ||
      effect.condition_source.modifier_count != 0) {
    return reject(failure, ValidationError::invalid_module,
                  "hardware.effects.source");
  }
  const bool bound = !text_view(effect.source.binding).empty();
  if (bound && !led_effect_reads_value(effect.type)) {
    return reject(failure, ValidationError::invalid_module, "hardware.effects.source");
  }
  if (!bound && (effect.type == LedEffectType::steps ||
                 effect.type == LedEffectType::gauge)) {
    return reject(failure, ValidationError::invalid_module, "hardware.effects.source");
  }
  return validate_gate(effect, failure) &&
         validate_content(device, effect, failure);
}

}

bool validate_led_effects(const HardwareDeviceConfiguration& device,
                          ValidationFailure& failure) {
  for (std::uint8_t index = 0; index < device.effect_count; ++index) {
    if (!validate_effect(device, device.effects[index], failure)) {
      return false;
    }
  }
  return true;
}

}
