#pragma once

#include "input_driver.hpp"

namespace simcore::input::drivers::guition_jc1060p470c {

// Returns the statically allocated Guition JC1060P470C touch driver descriptor.
[[nodiscard]] const driver::Driver& get();

}  // namespace simcore::input::drivers::guition_jc1060p470c
