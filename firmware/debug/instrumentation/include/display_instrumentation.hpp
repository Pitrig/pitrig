#pragma once

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace pitrig::display::instrumentation {

void observe(lv_display_t* display);

}
