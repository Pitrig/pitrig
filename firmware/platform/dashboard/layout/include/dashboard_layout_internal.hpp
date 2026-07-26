#pragma once

#include "dashboard_layout.hpp"
#include "lvgl.h"

namespace simcore::dashboard {

[[nodiscard]] lv_obj_t* create_widget_block(lv_obj_t* screen,
                                            const WidgetBlock& block);
void place_in_block(lv_obj_t* object, const Placement& placement);

}  // namespace simcore::dashboard
