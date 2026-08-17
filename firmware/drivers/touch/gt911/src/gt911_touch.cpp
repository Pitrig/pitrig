#include "gt911_touch.hpp"

#include "driver/i2c_master.h"
#include "esp_err.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_touch_gt911.h"

namespace simcore::input::drivers::gt911 {
namespace {

constexpr int kGlitchIgnoreCount = 7;

}  // namespace

driver::Configuration create(const Panel& panel) {
  i2c_master_bus_config_t bus_configuration = {};
  bus_configuration.i2c_port = I2C_NUM_0;
  bus_configuration.sda_io_num = panel.pins.sda;
  bus_configuration.scl_io_num = panel.pins.scl;
  bus_configuration.clk_source = I2C_CLK_SRC_DEFAULT;
  bus_configuration.glitch_ignore_cnt = kGlitchIgnoreCount;
  bus_configuration.flags.enable_internal_pullup = true;

  i2c_master_bus_handle_t bus = nullptr;
  ESP_ERROR_CHECK(i2c_new_master_bus(&bus_configuration, &bus));

  // The vendor macro carries the controller's address and control phases and
  // leaves the rest of the struct alone, which this build treats as an error.
  // Suppressed here rather than restated, so the address stays the component's
  // to define.
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
  esp_lcd_panel_io_i2c_config_t io_configuration =
      ESP_LCD_TOUCH_IO_I2C_GT911_CONFIG();
#pragma GCC diagnostic pop
  io_configuration.scl_speed_hz = panel.clock_hz;

  esp_lcd_panel_io_handle_t io = nullptr;
  ESP_ERROR_CHECK(esp_lcd_new_panel_io_i2c(bus, &io_configuration, &io));

  esp_lcd_touch_config_t touch_configuration = {};
  touch_configuration.x_max = panel.horizontal_resolution;
  touch_configuration.y_max = panel.vertical_resolution;
  touch_configuration.rst_gpio_num = panel.pins.reset;
  touch_configuration.int_gpio_num = panel.pins.interrupt;
  touch_configuration.levels.reset = 0;
  touch_configuration.levels.interrupt = 0;
  touch_configuration.flags.swap_xy = panel.swap_xy ? 1U : 0U;
  touch_configuration.flags.mirror_x = panel.mirror_x ? 1U : 0U;
  touch_configuration.flags.mirror_y = panel.mirror_y ? 1U : 0U;

  esp_lcd_touch_handle_t touch = nullptr;
  ESP_ERROR_CHECK(esp_lcd_touch_new_i2c_gt911(io, &touch_configuration, &touch));
  return {.touch = touch};
}

}  // namespace simcore::input::drivers::gt911
