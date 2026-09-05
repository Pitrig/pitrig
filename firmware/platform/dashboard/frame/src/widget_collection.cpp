#include "widget_collection.hpp"

#include "esp_lvgl_port.h"

namespace pitrig::dashboard::frame {

bool lock_lvgl() { return lvgl_port_lock(0); }

void unlock_lvgl() { lvgl_port_unlock(); }

}
