#include "display_driver.hpp"

#include <cstddef>
#include <cstdint>

#include "esp_err.h"
#include "esp_log.h"
#include "guition_jc1060p470c_display_driver.hpp"
#include "panel.h"

namespace simcore::display::drivers::guition_jc1060p470c {
namespace {

constexpr char kTag[] = "guition_jc1060";
constexpr std::uint32_t kHorizontalResolution = 1'024;
constexpr std::uint32_t kVerticalResolution = 600;

driver::Configuration initialize() {
  ESP_LOGI(kTag, "Initializing 1024x600 JD9165 MIPI-DSI RGB565 display");
  esp_lcd_panel_io_handle_t io = nullptr;
  esp_lcd_panel_handle_t panel = nullptr;
  ESP_ERROR_CHECK(simcore_jc1060p470c_panel_initialize(&io, &panel));

  return {
      .io = io,
      .panel = panel,
      .horizontal_resolution = kHorizontalResolution,
      .vertical_resolution = kVerticalResolution,
      .buffer_size = kHorizontalResolution * 60,
      .swap_xy = false,
      .mirror_x = false,
      .mirror_y = false,
      .bus_type = driver::BusType::dsi,
      .color_format = driver::ColorFormat::rgb565,
      .double_buffer = true,
      .buffer_in_dma_memory = true,
      .buffer_in_psram = false,
      .bounce_buffers = false,
      .avoid_tearing = false,
      .direct_mode = false,
  };
}

void on_display_ready() {
  ESP_ERROR_CHECK(simcore_jc1060p470c_backlight_on());
  ESP_LOGI(kTag, "Display driver ready");
}

const driver::Driver kDriver{
    .name = "guition_jc1060p470c",
    .initialize = initialize,
    .on_display_ready = on_display_ready,
};

}

const driver::Driver& get() { return kDriver; }

}
