#pragma once

#include "input_driver.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_indev_t;
using lv_indev_t = _lv_indev_t;

namespace pitrig::input {

[[nodiscard]] lv_indev_t* initialize(const driver::Driver& driver,
                                     lv_display_t* display);

}
