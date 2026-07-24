#pragma once

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::display {

// Initializes LVGL with the display driver selected by the firmware build.
[[nodiscard]] lv_display_t* initialize();

}  // namespace simcore::display
