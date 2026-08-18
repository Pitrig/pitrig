#pragma once

#include <cstdint>

#include "display_driver.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::display {

// Initializes LVGL with the display driver selected by application configuration.
[[nodiscard]] lv_display_t* initialize(const driver::Driver& driver);

// Invalidates the display and waits for the LVGL task to finish one refresh.
// Serves one caller at a time — startup uses it in sequence — and refuses
// before initialize() has run.
[[nodiscard]] bool refresh_and_wait(lv_display_t* display,
                                    std::uint32_t timeout_ms);

// Reports whether the LVGL task is inside a refresh that is drawing. Readable
// from any task. A driver that waits for the panel before reusing a frame
// buffer holds the LVGL lock for most of a panel period, so callers that would
// only ask for another refresh can skip the request while this is true.
[[nodiscard]] bool rendering_in_progress();

}  // namespace simcore::display
