#pragma once

#include <cstdint>

struct _lv_display_t;
struct _lv_obj_t;
using lv_display_t = _lv_display_t;
using lv_obj_t = _lv_obj_t;

namespace simcore::lap_timer {

[[nodiscard]] lv_obj_t* create(lv_display_t* display);
void set_time(lv_obj_t* label, std::uint32_t milliseconds);

}  // namespace simcore::lap_timer
