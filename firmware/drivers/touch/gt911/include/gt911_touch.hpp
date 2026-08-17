#pragma once

#include <cstdint>

#include "driver/gpio.h"
#include "input_driver.hpp"

namespace simcore::input::drivers::gt911 {

// One GT911 implementation shared by every board that carries the controller,
// the way one UART transport driver serves every board that has a UART. The
// board driver supplies its own wiring; the controller sequence stays here.

struct Pins {
  gpio_num_t sda;
  gpio_num_t scl;
  // GPIO_NUM_NC leaves the line unmanaged: the controller keeps its power-on
  // address and is polled over I2C instead of raising an interrupt.
  gpio_num_t reset;
  gpio_num_t interrupt;
};

struct Panel {
  Pins pins;
  std::uint32_t clock_hz;
  std::uint16_t horizontal_resolution;
  std::uint16_t vertical_resolution;
  bool swap_xy;
  bool mirror_x;
  bool mirror_y;
};

// Brings up an I2C master bus and the GT911 on it. Aborts on failure, as the
// display drivers do: a board that declares a touch panel it cannot reach is
// misconfigured rather than degraded.
[[nodiscard]] driver::Configuration create(const Panel& panel);

}  // namespace simcore::input::drivers::gt911
