#pragma once

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::dashboard::lap_timer_widget {

// Creates the lap timer label and its periodic render callback.
void create(lv_display_t* display);

}  // namespace simcore::dashboard::lap_timer_widget
