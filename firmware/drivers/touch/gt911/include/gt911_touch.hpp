#pragma once

#include <cstdint>

#include "driver/gpio.h"
#include "input_driver.hpp"

namespace simcore::input::drivers::gt911 {

struct Pins {
  gpio_num_t sda;
  gpio_num_t scl;
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

[[nodiscard]] driver::Configuration create(const Panel& panel);

}
