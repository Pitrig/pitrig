#pragma once

#include <cstdint>

#include "freertos/FreeRTOS.h"

namespace simcore::rgb_leds {

inline constexpr char kLedTag[] = "rgb_leds";
inline constexpr std::uint32_t kFramePeriodMs = 16;
inline constexpr std::uint32_t kTaskStackBytes = 6144;
inline constexpr UBaseType_t kTaskPriority = 3;

}
