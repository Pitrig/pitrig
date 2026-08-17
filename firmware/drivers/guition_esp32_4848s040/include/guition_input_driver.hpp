#pragma once

#include "input_driver.hpp"

namespace simcore::input::drivers::guition_esp32_4848s040 {

// Returns the statically allocated Guition ESP32-4848S040 touch driver
// descriptor.
[[nodiscard]] const driver::Driver& get();

}  // namespace simcore::input::drivers::guition_esp32_4848s040
