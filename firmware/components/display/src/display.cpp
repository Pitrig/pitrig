#include "display.hpp"

#include <atomic>
#include <cstdint>

#include "display_driver.hpp"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_lvgl_port.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "pitrig_features.hpp"
#if PITRIG_DEBUG
#include "display_instrumentation.hpp"
#endif

namespace pitrig::display {
namespace {

constexpr char kTag[] = "display";
constexpr int kLvglTaskCore = PITRIG_RENDER_CORE;
constexpr std::uint32_t kInitialFrameTimeoutMs = 1'000;
constexpr std::uint32_t kTaskMaxSleepMs = 16;
constexpr std::uint32_t kTimerPeriodMs = 2;

struct DisplayState {
  StaticSemaphore_t refresh_signal_storage{};
  SemaphoreHandle_t refresh_signal{};
  std::atomic<bool> rendering{false};
};

DisplayState state;

[[nodiscard]] DisplayState* state_of(lv_display_t* const display) {
  return display == nullptr ? nullptr
                            : static_cast<DisplayState*>(lv_display_get_user_data(display));
}

[[nodiscard]] DisplayState* state_of(lv_event_t* const event) {
  return static_cast<DisplayState*>(lv_event_get_user_data(event));
}

void on_rendering_started(lv_event_t* const event) {
  if (DisplayState* const display_state = state_of(event); display_state != nullptr) {
    display_state->rendering.store(true, std::memory_order_release);
  }
}

void on_rendering_finished(lv_event_t* const event) {
  if (DisplayState* const display_state = state_of(event); display_state != nullptr) {
    display_state->rendering.store(false, std::memory_order_release);
  }
}

lv_color_format_t to_lvgl_color_format(const driver::ColorFormat color_format) {
  switch (color_format) {
    case driver::ColorFormat::rgb565:
      return LV_COLOR_FORMAT_RGB565;
    case driver::ColorFormat::rgb888:
      return LV_COLOR_FORMAT_RGB888;
  }
  return LV_COLOR_FORMAT_UNKNOWN;
}

void on_refresh_ready(lv_event_t* const event) {
  const auto signal = static_cast<SemaphoreHandle_t>(lv_event_get_user_data(event));
  xSemaphoreGive(signal);
}

[[nodiscard]] bool configure_initial_black_screen(lv_display_t* const display) {
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

void release_lvgl(const driver::Driver& selected_driver) {
  if (state.refresh_signal != nullptr) {
    vSemaphoreDelete(state.refresh_signal);
    state.refresh_signal = nullptr;
  }
  (void)lvgl_port_deinit();
  selected_driver.release();
}

[[nodiscard]] lv_display_t* add_display(const driver::Configuration& hardware,
                                        const lvgl_port_display_cfg_t& display_config) {
  if (hardware.bus_type == driver::BusType::rgb) {
    const lvgl_port_display_rgb_cfg_t rgb_config = {
        .flags =
            {
                .bb_mode = hardware.bounce_buffers,
                .avoid_tearing = hardware.avoid_tearing,
            },
    };
    return lvgl_port_add_disp_rgb(&display_config, &rgb_config);
  }
  if (hardware.bus_type == driver::BusType::dsi) {
    const lvgl_port_display_dsi_cfg_t dsi_config = {
        .flags =
            {
                .avoid_tearing = hardware.avoid_tearing,
            },
    };
    return lvgl_port_add_disp_dsi(&display_config, &dsi_config);
  }
  return lvgl_port_add_disp(&display_config);
}

}

bool rendering_in_progress() {
  const DisplayState* const display_state = state_of(lv_display_get_default());
  return display_state != nullptr && display_state->rendering.load(std::memory_order_acquire);
}

bool refresh_and_wait(lv_display_t* const display, const std::uint32_t timeout_ms) {
  DisplayState* const display_state = state_of(display);
  if (display_state == nullptr || display_state->refresh_signal == nullptr) {
    return false;
  }
  const SemaphoreHandle_t signal = display_state->refresh_signal;
  (void)xSemaphoreTake(signal, 0);

  if (!lvgl_port_lock(0)) {
    return false;
  }
  lv_display_add_event_cb(display, on_refresh_ready, LV_EVENT_REFR_READY, signal);
  lv_obj_t* const screen = lv_display_get_screen_active(display);
  if (screen == nullptr) {
    lv_display_remove_event_cb_with_user_data(display, on_refresh_ready, signal);
    lvgl_port_unlock();
    return false;
  }
  lv_obj_invalidate(screen);
  if (lvgl_port_task_wake(LVGL_PORT_EVENT_DISPLAY, display) != ESP_OK) {
    lv_display_remove_event_cb_with_user_data(display, on_refresh_ready, signal);
    lvgl_port_unlock();
    return false;
  }
  lvgl_port_unlock();

  const bool refreshed = xSemaphoreTake(signal, pdMS_TO_TICKS(timeout_ms)) == pdTRUE;
  if (!lvgl_port_lock(0)) {
    return false;
  }
  lv_display_remove_event_cb_with_user_data(display, on_refresh_ready, signal);
  lvgl_port_unlock();
  return refreshed;
}

lv_display_t* initialize(const driver::Driver& selected_driver) {
  if (selected_driver.initialize == nullptr || selected_driver.release == nullptr ||
      selected_driver.on_display_ready == nullptr) {
    ESP_LOGE(kTag, "Board display driver is incomplete");
    return nullptr;
  }
  const driver::Configuration hardware = selected_driver.initialize();
  if (!driver::succeeded(hardware)) {
    ESP_LOGE(kTag, "Board display driver did not bring its panel up");
    return nullptr;
  }
  const lv_color_format_t color_format = to_lvgl_color_format(hardware.color_format);
  if (color_format == LV_COLOR_FORMAT_UNKNOWN) {
    ESP_LOGE(kTag, "Board display driver asked for an unsupported color format");
    selected_driver.release();
    return nullptr;
  }

  lvgl_port_cfg_t lvgl_config = ESP_LVGL_PORT_INIT_CONFIG();
  lvgl_config.task_affinity = kLvglTaskCore;
  lvgl_config.task_max_sleep_ms = kTaskMaxSleepMs;
  lvgl_config.timer_period_ms = kTimerPeriodMs;
  if (lvgl_port_init(&lvgl_config) != ESP_OK) {
    ESP_LOGE(kTag, "LVGL port did not start");
    selected_driver.release();
    return nullptr;
  }
  state.refresh_signal = xSemaphoreCreateBinaryStatic(&state.refresh_signal_storage);
  if (state.refresh_signal == nullptr) {
    ESP_LOGE(kTag, "No memory for the refresh signal");
    release_lvgl(selected_driver);
    return nullptr;
  }

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
      .rotation =
          {
              .swap_xy = hardware.swap_xy,
              .mirror_x = hardware.mirror_x,
              .mirror_y = hardware.mirror_y,
          },
      .rounder_cb = nullptr,
      .color_format = color_format,
      .flags =
          {
              .buff_dma = hardware.buffer_in_dma_memory,
              .buff_spiram = hardware.buffer_in_psram,
              .sw_rotate = false,
              .swap_bytes = false,
              .full_refresh = hardware.full_refresh,
              .direct_mode = hardware.direct_mode,
              .full_strips = hardware.full_strips,
          },
  };

  lv_display_t* const display = add_display(hardware, display_config);
  if (display == nullptr) {
    ESP_LOGE(kTag, "LVGL port refused the panel");
    release_lvgl(selected_driver);
    return nullptr;
  }
  lv_display_set_user_data(display, &state);
  lv_display_add_event_cb(display, on_rendering_started, LV_EVENT_RENDER_START, &state);
  lv_display_add_event_cb(display, on_rendering_finished, LV_EVENT_REFR_READY, &state);
#if PITRIG_DEBUG
  instrumentation::observe(display);
#endif
  if (!configure_initial_black_screen(display)) {
    ESP_LOGE(kTag, "Panel did not present its first frame");
    (void)lvgl_port_remove_disp(display);
    release_lvgl(selected_driver);
    return nullptr;
  }
  selected_driver.on_display_ready();
  return display;
}

}
