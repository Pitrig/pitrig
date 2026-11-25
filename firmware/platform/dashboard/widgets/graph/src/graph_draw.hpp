#pragma once

#include "graph_widget.hpp"
#include "lvgl.h"

namespace pitrig::dashboard::graph_widget::draw {

void attach(lv_obj_t* plot, State& state);

}
