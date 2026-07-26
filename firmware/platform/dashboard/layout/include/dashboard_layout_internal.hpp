#pragma once

#include "dashboard_layout.hpp"
#include "lvgl.h"
#include "simcore_features.hpp"

namespace simcore::dashboard {

[[nodiscard]] lv_obj_t* create_widget_block(lv_obj_t* screen,
                                            const WidgetBlock& block);
void place_in_block(lv_obj_t* object, const Placement& placement);

#if SIMCORE_LAYOUT_DEBUG
void apply_debug_widget_outline(lv_obj_t* object);
#else
inline void apply_debug_widget_outline(lv_obj_t*) {}
#endif

}  // namespace simcore::dashboard
