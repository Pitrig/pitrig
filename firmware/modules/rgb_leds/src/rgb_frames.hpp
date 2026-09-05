#pragma once

#include <cstdint>

#include "freertos/FreeRTOS.h"
#include "led_paint.hpp"
#include "telemetry_state.hpp"

namespace pitrig::rgb_leds {

struct EffectBinding {
  telemetry::Handle value{};
  telemetry::Handle condition{};
  const configuration::LedSpriteConfiguration* sprite{};
  Area area{};
};

struct EffectState {
  std::uint64_t hold_until_us{};
  std::uint64_t started_us{};
  ColorRuleState colors{};
  bool holding{};
};

inline constexpr char kLedTag[] = "rgb_leds";
inline constexpr std::uint32_t kFramePeriodMs = 16;
inline constexpr std::uint32_t kTaskStackBytes = 6144;
inline constexpr UBaseType_t kTaskPriority = 3;

}
