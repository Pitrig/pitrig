#pragma once

#include "display_driver.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::display {

// Initializes LVGL with the display driver selected by application configuration.
[[nodiscard]] lv_display_t* initialize(const driver::Driver& driver);

}  // namespace simcore::display
