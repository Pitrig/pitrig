#include "display_driver.hpp"

#include <cstddef>
#include <cstdint>

#include "esp_err.h"
#include "esp_log.h"
#include "guition_jc1060p470c_display_driver.hpp"
#include "panel.h"
#include "pitrig_features.hpp"

namespace pitrig::display::drivers::guition_jc1060p470c {
namespace {

constexpr char kTag[] = "guition_jc1060";
constexpr std::uint32_t kHorizontalResolution = 1'024;
constexpr std::uint32_t kVerticalResolution = 600;

constexpr bool kTrueColor = PITRIG_DISPLAY_COLOR_24BIT != 0;
constexpr driver::ColorFormat kColorFormat =
    kTrueColor ? driver::ColorFormat::rgb888 : driver::ColorFormat::rgb565;

struct Hardware {
  esp_lcd_panel_io_handle_t io;
  esp_lcd_panel_handle_t panel;
};

Hardware hardware;

void release() { pitrig_jc1060p470c_panel_release(&hardware.io, &hardware.panel); }

driver::Configuration initialize() {
  ESP_LOGI(kTag, "Initializing 1024x600 JD9165 MIPI-DSI %s display",
           kTrueColor ? "RGB888" : "RGB565");
  if (pitrig_jc1060p470c_panel_initialize(&hardware.io, &hardware.panel) != ESP_OK) {
    ESP_LOGE(kTag, "JD9165 panel did not come up");
    return {};
  }

  constexpr bool kPanelBuffers =
      PITRIG_DISPLAY_RENDER_DIRECT != 0 || PITRIG_DISPLAY_RENDER_FULL != 0;
  return {
      .io = hardware.io,
      .panel = hardware.panel,
      .horizontal_resolution = kHorizontalResolution,
      .vertical_resolution = kVerticalResolution,
      .buffer_size = kPanelBuffers ? kHorizontalResolution * kVerticalResolution
                                   : kHorizontalResolution *
                                         (PITRIG_DISPLAY_RENDER_FULL_STRIPS != 0 ? 60 : 40),
      .swap_xy = false,
      .mirror_x = false,
      .mirror_y = false,
      .bus_type = driver::BusType::dsi,
      .color_format = kColorFormat,
      .double_buffer = true,
      .buffer_in_dma_memory = !kPanelBuffers && !kTrueColor,
      .buffer_in_psram = !kPanelBuffers && kTrueColor,
      .bounce_buffers = false,
      .avoid_tearing = kPanelBuffers,
      .direct_mode = PITRIG_DISPLAY_RENDER_DIRECT != 0,
      .full_refresh = PITRIG_DISPLAY_RENDER_FULL != 0,
      .full_strips = PITRIG_DISPLAY_RENDER_FULL_STRIPS != 0,
  };
}

void on_display_ready() {
  if (pitrig_jc1060p470c_backlight_on() != ESP_OK) {
    ESP_LOGW(kTag, "Backlight did not turn on");
  }
  ESP_LOGI(kTag, "Display driver ready");
}

const driver::Driver kDriver{
    .name = "guition_jc1060p470c",
    .initialize = initialize,
    .release = release,
    .on_display_ready = on_display_ready,
};

}

const driver::Driver& get() { return kDriver; }

}
