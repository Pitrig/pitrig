#include "display.hpp"

#include "esp_err.h"
#include "esp_lvgl_port.h"
#include "display_driver.hpp"

namespace simcore::display {
namespace {

constexpr int kLvglTaskCore = 1;

}  // namespace

lv_display_t* initialize() {
  const driver::Configuration hardware = driver::initialize();

  lvgl_port_cfg_t lvgl_config = ESP_LVGL_PORT_INIT_CONFIG();
  lvgl_config.task_affinity = kLvglTaskCore;
  ESP_ERROR_CHECK(lvgl_port_init(&lvgl_config));

  const lvgl_port_display_cfg_t display_config = {
      .io_handle = hardware.io,
      .panel_handle = hardware.panel,
      .control_handle = nullptr,
      .buffer_size = hardware.buffer_size,
      .double_buffer = true,
      .trans_size = 0,
      .hres = hardware.horizontal_resolution,
      .vres = hardware.vertical_resolution,
      .monochrome = false,
      .rotation = {
          .swap_xy = hardware.swap_xy,
          .mirror_x = hardware.mirror_x,
          .mirror_y = hardware.mirror_y,
      },
      .rounder_cb = nullptr,
      .color_format = LV_COLOR_FORMAT_RGB565,
      .flags = {
          .buff_dma = true,
          .buff_spiram = false,
          .sw_rotate = false,
          .swap_bytes = false,
          .full_refresh = false,
          .direct_mode = false,
      },
  };

  lv_display_t* display = lvgl_port_add_disp(&display_config);
  ESP_ERROR_CHECK(display == nullptr ? ESP_FAIL : ESP_OK);
  driver::on_display_ready();
  return display;
}

}  // namespace simcore::display
