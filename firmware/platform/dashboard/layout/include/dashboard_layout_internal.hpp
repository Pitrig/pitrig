#pragma once

#include "dashboard_layout.hpp"
#include "lvgl.h"
#include "simcore_features.hpp"

namespace simcore::dashboard {

[[nodiscard]] bool resolve_widget_bounds(const Layout& layout,
                                         const Placement& placement,
                                         std::uint8_t screen_index,
                                         std::uint8_t group_index,
                                         bool group_present,
                                         std::int32_t intrinsic_width,
                                         std::int32_t intrinsic_height,
                                         bool fill_available_width,
                                         lv_obj_t*& parent,
                                         Rect& bounds);

#if SIMCORE_LAYOUT_DEBUG
void apply_debug_widget_outline(lv_obj_t* object);
#else
inline void apply_debug_widget_outline(lv_obj_t*) {}
#endif

}  // namespace simcore::dashboard
