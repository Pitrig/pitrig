#pragma once

#include "display_driver.hpp"

namespace simcore::display::drivers::guition_esp32_4848s040 {

// Returns the statically allocated Guition display driver descriptor.
[[nodiscard]] const driver::Driver& get();

}  // namespace simcore::display::drivers::guition_esp32_4848s040
