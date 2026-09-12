#pragma once

#include "application_configuration.hpp"
#include "led_driver.hpp"
#include "rgb_leds.hpp"

namespace pitrig::rgb_leds {

[[nodiscard]] led::driver::Chip chip_of(configuration::LedChip chip);

[[nodiscard]] led::Matrix geometry_of(const configuration::HardwareDeviceConfiguration& device);

[[nodiscard]] std::size_t lamps_of(const configuration::HardwareDeviceConfiguration& device);

}
