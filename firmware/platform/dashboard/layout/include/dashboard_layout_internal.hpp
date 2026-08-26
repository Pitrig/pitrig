#pragma once

#include "dashboard_layout.hpp"
#include "lvgl.h"
#include "simcore_features.hpp"

namespace simcore::dashboard {

[[nodiscard]] bool resolve_widget_bounds(const Layout& layout,
                                         const configuration::WidgetFrame& frame,
                                         const Placement& placement,
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

}
