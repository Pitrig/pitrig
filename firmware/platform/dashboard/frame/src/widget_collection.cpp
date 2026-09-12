#include "widget_collection.hpp"

#include "esp_lvgl_port.h"

namespace pitrig::dashboard::frame {

bool lock_lvgl() { return lvgl_port_lock(0); }

void unlock_lvgl() { lvgl_port_unlock(); }

bool on_shown_screen(const lv_obj_t* const object) {
  if (object == nullptr) {
    return false;
  }
  lv_obj_t* const screen = lv_obj_get_screen(object);
  lv_display_t* const display = lv_obj_get_display(object);
  if (screen == nullptr || display == nullptr) {
    return false;
  }
  return screen == lv_display_get_screen_active(display) ||
         screen == lv_display_get_screen_prev(display);
}

}
