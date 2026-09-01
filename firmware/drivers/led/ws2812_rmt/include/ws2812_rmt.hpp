#pragma once

#include "led_driver.hpp"

namespace simcore::led::drivers::ws2812_rmt {

[[nodiscard]] const driver::Driver& get();

}
