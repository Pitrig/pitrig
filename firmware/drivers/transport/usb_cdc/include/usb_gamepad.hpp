#pragma once

#include <cstdint>

#include "tinyusb.h"

namespace simcore::transport::usb_gamepad {

inline constexpr std::size_t kButtonCount = 32;

struct Report {
  std::int8_t x{};
  std::int8_t y{};
  std::int8_t z{};
  std::int8_t rz{};
  std::int8_t rx{};
  std::int8_t ry{};
  std::uint8_t hat{};
  std::uint32_t buttons{};
};

[[nodiscard]] bool available();

[[nodiscard]] bool ready();

bool send(const Report& report);

}
