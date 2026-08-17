#include "input.hpp"

#include "esp_lvgl_port.h"

namespace simcore::input {

lv_indev_t* initialize(const driver::Driver& selected_driver,
                       lv_display_t* const display) {
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

  return lvgl_port_add_touch(&touch_configuration);
}

}  // namespace simcore::input
