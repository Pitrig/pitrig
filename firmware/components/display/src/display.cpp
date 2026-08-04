#include "display.hpp"

#include <cstdint>

#include "esp_err.h"
#include "esp_lvgl_port.h"
#include "display_driver.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "simcore_features.hpp"
#if SIMCORE_DEBUG
#include "performance.hpp"
#endif

namespace simcore::display {
namespace {

constexpr int kLvglTaskCore = 1;
constexpr std::uint32_t kInitialFrameTimeoutMs = 1'000;
#if SIMCORE_DEBUG
constexpr std::uint32_t kTaskMaxSleepMs = 8;
constexpr std::uint32_t kTimerPeriodMs = 2;
#else
constexpr std::uint32_t kTaskMaxSleepMs = 16;
constexpr std::uint32_t kTimerPeriodMs = 8;
#endif

StaticSemaphore_t refresh_signal_storage;
SemaphoreHandle_t refresh_signal;

void on_refresh_ready(lv_event_t* const event) {
  const auto signal =
      static_cast<SemaphoreHandle_t>(lv_event_get_user_data(event));
  xSemaphoreGive(signal);
}

void configure_initial_black_screen(lv_display_t* const display) {
  ESP_ERROR_CHECK(lvgl_port_lock(0) ? ESP_OK : ESP_FAIL);
  lv_obj_t* const screen = lv_display_get_screen_active(display);
  ESP_ERROR_CHECK(screen == nullptr ? ESP_FAIL : ESP_OK);
  lv_obj_set_style_bg_color(screen, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);
  lvgl_port_unlock();
  ESP_ERROR_CHECK(refresh_and_wait(display, kInitialFrameTimeoutMs)
                      ? ESP_OK
                      : ESP_ERR_TIMEOUT);
}

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

bool refresh_and_wait(lv_display_t* const display,
                      const std::uint32_t timeout_ms) {
  if (display == nullptr) {
    return false;
  }
  if (refresh_signal == nullptr) {
    refresh_signal = xSemaphoreCreateBinaryStatic(&refresh_signal_storage);
  }
  if (refresh_signal == nullptr) {
    return false;
  }
  (void)xSemaphoreTake(refresh_signal, 0);

  if (!lvgl_port_lock(0)) {
    return false;
  }
  lv_display_add_event_cb(display, on_refresh_ready, LV_EVENT_REFR_READY,
                          refresh_signal);
  lv_obj_t* const screen = lv_display_get_screen_active(display);
  if (screen == nullptr) {
    lv_display_remove_event_cb_with_user_data(display, on_refresh_ready,
                                              refresh_signal);
    lvgl_port_unlock();
    return false;
  }
  lv_obj_invalidate(screen);
  ESP_ERROR_CHECK(lvgl_port_task_wake(LVGL_PORT_EVENT_DISPLAY, display));
  lvgl_port_unlock();

  const bool refreshed =
      xSemaphoreTake(refresh_signal, pdMS_TO_TICKS(timeout_ms)) == pdTRUE;
  if (!lvgl_port_lock(0)) {
    return false;
  }
  lv_display_remove_event_cb_with_user_data(display, on_refresh_ready,
                                            refresh_signal);
  lvgl_port_unlock();
  return refreshed;
}

lv_display_t* initialize(const driver::Driver& selected_driver) {
  ESP_ERROR_CHECK(selected_driver.initialize == nullptr ? ESP_ERR_INVALID_ARG
                                                        : ESP_OK);
  ESP_ERROR_CHECK(selected_driver.on_display_ready == nullptr
                      ? ESP_ERR_INVALID_ARG
                      : ESP_OK);
  const driver::Configuration hardware = selected_driver.initialize();

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
      .double_buffer = hardware.double_buffer,
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
          .buff_dma = hardware.buffer_in_dma_memory,
          .buff_spiram = hardware.buffer_in_psram,
          .sw_rotate = false,
          .swap_bytes = false,
          .full_refresh = false,
          .direct_mode = hardware.direct_mode,
      },
  };

  lv_display_t* display = nullptr;
  if (hardware.bus_type == driver::BusType::rgb) {
    const lvgl_port_display_rgb_cfg_t rgb_config = {
        .flags = {
            .bb_mode = false,
            .avoid_tearing = hardware.avoid_tearing,
        },
    };
    display = lvgl_port_add_disp_rgb(&display_config, &rgb_config);
  } else {
    display = lvgl_port_add_disp(&display_config);
  }
  ESP_ERROR_CHECK(display == nullptr ? ESP_FAIL : ESP_OK);
#if SIMCORE_DEBUG
  register_performance_events(display);
#endif
  configure_initial_black_screen(display);
  selected_driver.on_display_ready();
  return display;
}

}  // namespace simcore::display
