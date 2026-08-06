#pragma once

#include "display_driver.hpp"

namespace simcore::display::drivers::guition_jc1060p470c {

// Returns the statically allocated Guition JC1060P470C display descriptor.
[[nodiscard]] const driver::Driver& get();

}  // namespace simcore::display::drivers::guition_jc1060p470c
