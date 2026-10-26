#pragma once

#include <cstdint>

#include "event_bus.hpp"

namespace pitrig::events {

inline constexpr EventId kLedControlEvent = 0x4C454443U;

struct LedControl {
  std::uint8_t scale_percent{100};
  bool lit{true};
};

}
