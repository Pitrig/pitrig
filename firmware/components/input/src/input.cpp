#include "input.hpp"

#include <cstdint>

#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace {

constexpr std::uint8_t kGestureMinimumVelocityPx = 1;

constexpr std::uint8_t kGestureMinimumDistancePx = 20;

}

namespace pitrig::input {

lv_indev_t* initialize(const driver::Driver& selected_driver, lv_display_t* const display) {
  if (selected_driver.initialize == nullptr) {
    return nullptr;
  }
  const driver::Configuration hardware = selected_driver.initialize();
  if (hardware.touch == nullptr) {
    return nullptr;
  }

  lvgl_port_touch_cfg_t touch_configuration = {};
  touch_configuration.disp = display;
  touch_configuration.handle = hardware.touch;

  lv_indev_t* const pointer = lvgl_port_add_touch(&touch_configuration);
  if (pointer != nullptr && lvgl_port_lock(0)) {
    lv_indev_set_gesture_min_velocity(pointer, kGestureMinimumVelocityPx);
    lv_indev_set_gesture_min_distance(pointer, kGestureMinimumDistancePx);
    lvgl_port_unlock();
  }
  return pointer;
}

}
