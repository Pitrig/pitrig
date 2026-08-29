#pragma once

#include <cstdint>

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::dashboard::boot_splash {

[[nodiscard]] bool show(lv_display_t* display, lv_obj_t* layer);

void dismiss(std::uint32_t minimum_visible_ms);

}
