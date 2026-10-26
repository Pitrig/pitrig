#pragma once

#include <cstdint>

#include "display_driver.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace pitrig::display {

[[nodiscard]] lv_display_t* initialize(const driver::Driver& driver,
                                       std::uint8_t backlight_percent);

bool set_backlight(std::uint8_t percent);

[[nodiscard]] bool refresh_and_wait(lv_display_t* display, std::uint32_t timeout_ms);

[[nodiscard]] bool rendering_in_progress();

}
