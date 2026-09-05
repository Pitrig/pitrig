#pragma once

#include "led_driver.hpp"

namespace pitrig::led::drivers::ws2812_rmt {

[[nodiscard]] const driver::Driver& get();

}
