#pragma once

#include <cstdint>

#include "display_driver.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::display {

// Initializes LVGL with the display driver selected by application configuration.
[[nodiscard]] lv_display_t* initialize(const driver::Driver& driver);

// Invalidates the display and waits for the LVGL task to finish one refresh.
[[nodiscard]] bool refresh_and_wait(lv_display_t* display,
                                    std::uint32_t timeout_ms);

}  // namespace simcore::display
