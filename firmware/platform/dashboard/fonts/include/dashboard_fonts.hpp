#pragma once

#include "dashboard_layout.hpp"
#include "lvgl.h"

namespace simcore::dashboard::fonts {

// Resolves a font by its stable family identifier and pixel size. Missing
// assets and unsupported built-in sizes fall back to the nearest compiled
// Montserrat size.
[[nodiscard]] const lv_font_t* resolve(const FontSpec& spec);

}  // namespace simcore::dashboard::fonts
