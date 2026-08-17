#pragma once

#include "input_driver.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_indev_t;
using lv_indev_t = _lv_indev_t;

namespace simcore::input {

// Registers the board's pointer device with the LVGL port. The returned device
// lives for the lifetime of the firmware: applying a configuration replaces
// widgets, not hardware.
[[nodiscard]] lv_indev_t* initialize(const driver::Driver& driver,
                                     lv_display_t* display);

}  // namespace simcore::input
