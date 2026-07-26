#pragma once

#include "dashboard_layout.hpp"
#include "lvgl.h"

namespace simcore::dashboard::fonts {

// Resolves a generated bitmap font by family and pixel size. Unsupported
// combinations fall back to the default LCD font.
[[nodiscard]] const lv_font_t* resolve(FontSpec spec);

}  // namespace simcore::dashboard::fonts
