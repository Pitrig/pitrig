#pragma once

#include <cstdint>

#include "lvgl_types.hpp"

namespace simcore::dashboard::boot_splash {

[[nodiscard]] bool show(lv_display_t* display, lv_obj_t* layer);

void dismiss(std::uint32_t minimum_visible_ms);

}
