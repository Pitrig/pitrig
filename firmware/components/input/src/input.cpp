#include "input.hpp"

#include "esp_err.h"
#include "esp_lvgl_port.h"

namespace simcore::input {

lv_indev_t* initialize(const driver::Driver& selected_driver,
                       lv_display_t* const display) {
  ESP_ERROR_CHECK(selected_driver.initialize == nullptr ? ESP_ERR_INVALID_ARG
                                                        : ESP_OK);
  const driver::Configuration hardware = selected_driver.initialize();
  ESP_ERROR_CHECK(hardware.touch == nullptr ? ESP_FAIL : ESP_OK);

  lvgl_port_touch_cfg_t touch_configuration = {};
  touch_configuration.disp = display;
  touch_configuration.handle = hardware.touch;

  lv_indev_t* const device = lvgl_port_add_touch(&touch_configuration);
  ESP_ERROR_CHECK(device == nullptr ? ESP_FAIL : ESP_OK);
  return device;
}

}  // namespace simcore::input
