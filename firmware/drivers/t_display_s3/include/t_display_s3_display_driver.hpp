#pragma once

#include "display_driver.hpp"

namespace simcore::display::drivers::t_display_s3 {

// Returns the statically allocated T-Display-S3 display driver descriptor.
[[nodiscard]] const driver::Driver& get();

}  // namespace simcore::display::drivers::t_display_s3
