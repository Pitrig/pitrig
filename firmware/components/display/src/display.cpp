#include "display.hpp"

#include <atomic>
#include <cstdint>

#include "esp_err.h"
#include "esp_log.h"
#include "esp_lvgl_port.h"
#include "display_driver.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "simcore_features.hpp"
#if SIMCORE_DEBUG
#include "performance.hpp"
#endif

namespace simcore::display {
namespace {

constexpr char kTag[] = "display";
constexpr int kLvglTaskCore = SIMCORE_RENDER_CORE;
constexpr std::uint32_t kInitialFrameTimeoutMs = 1'000;
constexpr std::uint32_t kTaskMaxSleepMs = 16;
constexpr std::uint32_t kTimerPeriodMs = 2;

StaticSemaphore_t refresh_signal_storage;
SemaphoreHandle_t refresh_signal;
std::atomic<bool> rendering{false};

void on_rendering_started(lv_event_t*) {
  rendering.store(true, std::memory_order_release);
}

void on_rendering_finished(lv_event_t*) {
  rendering.store(false, std::memory_order_release);
}

lv_color_format_t to_lvgl_color_format(
    const driver::ColorFormat color_format) {
  switch (color_format) {
    case driver::ColorFormat::rgb565:
      return LV_COLOR_FORMAT_RGB565;
    case driver::ColorFormat::rgb888:
      return LV_COLOR_FORMAT_RGB888;
  }
  return LV_COLOR_FORMAT_UNKNOWN;
}

void on_refresh_ready(lv_event_t* const event) {
  const auto signal =
      static_cast<SemaphoreHandle_t>(lv_event_get_user_data(event));
  xSemaphoreGive(signal);
}

[[nodiscard]] bool configure_initial_black_screen(
    lv_display_t* const display) {
  if (!lvgl_port_lock(0)) {
    return false;
  }
  lv_obj_t* const screen = lv_display_get_screen_active(display);
  if (screen == nullptr) {
    lvgl_port_unlock();
    return false;
  }
  lv_obj_set_style_bg_color(screen, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);
  lvgl_port_unlock();
  return refresh_and_wait(display, kInitialFrameTimeoutMs);
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

void on_area_invalidated(lv_event_t* const event) {
  const auto* const area =
      static_cast<const lv_area_t*>(lv_event_get_param(event));
  if (area != nullptr) {
    performance::area_invalidated(
        static_cast<std::uint32_t>(lv_area_get_width(area)) *
        static_cast<std::uint32_t>(lv_area_get_height(area)));
  }
}

void on_flush_started(lv_event_t*) {
  performance::flush_started();
}

void on_flush_finished(lv_event_t*) {
  performance::flush_finished();
}

void on_flush_wait_started(lv_event_t*) {
  performance::flush_wait_started();
}

void on_flush_wait_finished(lv_event_t*) {
  performance::flush_wait_finished();
}

void register_performance_events(lv_display_t* display) {
  lv_display_add_event_cb(display, on_refresh_started, LV_EVENT_REFR_START, nullptr);
  lv_display_add_event_cb(display, on_render_started, LV_EVENT_RENDER_START, nullptr);
  lv_display_add_event_cb(display, on_render_finished, LV_EVENT_RENDER_READY, nullptr);
  lv_display_add_event_cb(display, on_refresh_finished, LV_EVENT_REFR_READY, nullptr);
  lv_display_add_event_cb(display, on_area_invalidated, LV_EVENT_INVALIDATE_AREA,
                          nullptr);
  lv_display_add_event_cb(display, on_flush_started, LV_EVENT_FLUSH_START, nullptr);
  lv_display_add_event_cb(display, on_flush_finished, LV_EVENT_FLUSH_FINISH, nullptr);
  lv_display_add_event_cb(display, on_flush_wait_started, LV_EVENT_FLUSH_WAIT_START,
                          nullptr);
  lv_display_add_event_cb(display, on_flush_wait_finished, LV_EVENT_FLUSH_WAIT_FINISH,
                          nullptr);
}
#endif

}

bool rendering_in_progress() {
  return rendering.load(std::memory_order_acquire);
}

bool refresh_and_wait(lv_display_t* const display,
                      const std::uint32_t timeout_ms) {
  if (display == nullptr || refresh_signal == nullptr) {
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
  if (lvgl_port_task_wake(LVGL_PORT_EVENT_DISPLAY, display) != ESP_OK) {
    lv_display_remove_event_cb_with_user_data(display, on_refresh_ready,
                                              refresh_signal);
    lvgl_port_unlock();
    return false;
  }
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
  if (selected_driver.initialize == nullptr ||
      selected_driver.on_display_ready == nullptr) {
    ESP_LOGE(kTag, "Board display driver is incomplete");
    return nullptr;
  }
  const driver::Configuration hardware = selected_driver.initialize();
  const lv_color_format_t color_format =
      to_lvgl_color_format(hardware.color_format);
  if (color_format == LV_COLOR_FORMAT_UNKNOWN) {
    ESP_LOGE(kTag, "Board display driver asked for an unsupported color format");
    return nullptr;
  }

  lvgl_port_cfg_t lvgl_config = ESP_LVGL_PORT_INIT_CONFIG();
  lvgl_config.task_affinity = kLvglTaskCore;
  lvgl_config.task_max_sleep_ms = kTaskMaxSleepMs;
  lvgl_config.timer_period_ms = kTimerPeriodMs;
  if (lvgl_port_init(&lvgl_config) != ESP_OK) {
    ESP_LOGE(kTag, "LVGL port did not start");
    return nullptr;
  }
  refresh_signal = xSemaphoreCreateBinaryStatic(&refresh_signal_storage);
  if (refresh_signal == nullptr) {
    ESP_LOGE(kTag, "No memory for the refresh signal");
    return nullptr;
  }
#if SIMCORE_DEBUG
  performance::register_task(performance::TaskMetric::lvgl,
                             xTaskGetHandle("taskLVGL"));
#endif

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
      .color_format = color_format,
      .flags = {
          .buff_dma = hardware.buffer_in_dma_memory,
          .buff_spiram = hardware.buffer_in_psram,
          .sw_rotate = false,
          .swap_bytes = false,
          .full_refresh = hardware.full_refresh,
          .direct_mode = hardware.direct_mode,
          .full_strips = hardware.full_strips,
      },
  };

  lv_display_t* display = nullptr;
  if (hardware.bus_type == driver::BusType::rgb) {
    const lvgl_port_display_rgb_cfg_t rgb_config = {
        .flags = {
            .bb_mode = hardware.bounce_buffers,
            .avoid_tearing = hardware.avoid_tearing,
        },
    };
    display = lvgl_port_add_disp_rgb(&display_config, &rgb_config);
  } else if (hardware.bus_type == driver::BusType::dsi) {
    const lvgl_port_display_dsi_cfg_t dsi_config = {
        .flags = {
            .avoid_tearing = hardware.avoid_tearing,
        },
    };
    display = lvgl_port_add_disp_dsi(&display_config, &dsi_config);
  } else {
    display = lvgl_port_add_disp(&display_config);
  }
  if (display == nullptr) {
    ESP_LOGE(kTag, "LVGL port refused the panel");
    return nullptr;
  }
  lv_display_add_event_cb(display, on_rendering_started, LV_EVENT_RENDER_START,
                          nullptr);
  lv_display_add_event_cb(display, on_rendering_finished, LV_EVENT_REFR_READY,
                          nullptr);
#if SIMCORE_DEBUG
  register_performance_events(display);
#endif
  if (!configure_initial_black_screen(display)) {
    ESP_LOGE(kTag, "Panel did not present its first frame");
    return nullptr;
  }
  selected_driver.on_display_ready();
  return display;
}

}
