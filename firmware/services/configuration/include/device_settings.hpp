#pragma once

#include <cstdint>

namespace pitrig::configuration {

inline constexpr std::uint8_t kMinimumDisplayBrightness = 10;
inline constexpr std::uint8_t kMaximumDisplayBrightness = 100;

struct DeviceSettings {
  std::uint8_t display_brightness{kMaximumDisplayBrightness};

  [[nodiscard]] bool operator==(const DeviceSettings&) const = default;
};

}
