#include "display.hpp"

#include <cstdint>

#include "esp_err.h"
#include "esp_lvgl_port.h"
#include "display_driver.hpp"
#include "simcore_features.hpp"
#if SIMCORE_DEBUG
#include "performance.hpp"
#endif

namespace simcore::display {
namespace {

constexpr int kLvglTaskCore = 1;
#if SIMCORE_DEBUG
constexpr std::uint32_t kTaskMaxSleepMs = 8;
constexpr std::uint32_t kTimerPeriodMs = 2;
#else
constexpr std::uint32_t kTaskMaxSleepMs = 16;
constexpr std::uint32_t kTimerPeriodMs = 8;
#endif

#if SIMCORE_DEBUG
bool frame_rendered;

void on_refresh_started(lv_event_t*) {
  frame_rendered = false;
  performance::frame_started();
}

void on_render_started(lv_event_t*) {
  frame_rendered = true;
  performance::render_started();
}

void on_render_finished(lv_event_t*) {
  performance::render_finished();
}

void on_refresh_finished(lv_event_t*) {
  if (frame_rendered) {
    performance::frame_finished();
  }
}

void on_flush_started(lv_event_t*) {
  performance::flush_started();
}

void on_flush_finished(lv_event_t*) {
  performance::flush_finished();
}

void register_performance_events(lv_display_t* display) {
  lv_display_add_event_cb(display, on_refresh_started, LV_EVENT_REFR_START, nullptr);
  lv_display_add_event_cb(display, on_render_started, LV_EVENT_RENDER_START, nullptr);
  lv_display_add_event_cb(display, on_render_finished, LV_EVENT_RENDER_READY, nullptr);
  lv_display_add_event_cb(display, on_refresh_finished, LV_EVENT_REFR_READY, nullptr);
  lv_display_add_event_cb(display, on_flush_started, LV_EVENT_FLUSH_START, nullptr);
  lv_display_add_event_cb(display, on_flush_finished, LV_EVENT_FLUSH_WAIT_FINISH, nullptr);
}
#endif

}  // namespace

lv_display_t* initialize() {
  const driver::Configuration hardware = driver::initialize();

  lvgl_port_cfg_t lvgl_config = ESP_LVGL_PORT_INIT_CONFIG();
  lvgl_config.task_affinity = kLvglTaskCore;
  lvgl_config.task_max_sleep_ms = kTaskMaxSleepMs;
  lvgl_config.timer_period_ms = kTimerPeriodMs;
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
#if SIMCORE_DEBUG
  register_performance_events(display);
#endif
  driver::on_display_ready();
  return display;
}

}  // namespace simcore::display
