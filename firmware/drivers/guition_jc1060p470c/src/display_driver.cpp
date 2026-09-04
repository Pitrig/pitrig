#include "display_driver.hpp"

#include <cstddef>
#include <cstdint>

#include "esp_err.h"
#include "esp_log.h"
#include "guition_jc1060p470c_display_driver.hpp"
#include "panel.h"
#include "simcore_features.hpp"

namespace simcore::display::drivers::guition_jc1060p470c {
namespace {

constexpr char kTag[] = "guition_jc1060";
constexpr std::uint32_t kHorizontalResolution = 1'024;
constexpr std::uint32_t kVerticalResolution = 600;

constexpr bool kTrueColor = SIMCORE_DISPLAY_COLOR_24BIT != 0;
constexpr driver::ColorFormat kColorFormat =
    kTrueColor ? driver::ColorFormat::rgb888 : driver::ColorFormat::rgb565;

driver::Configuration initialize() {
  ESP_LOGI(kTag, "Initializing 1024x600 JD9165 MIPI-DSI %s display",
           kTrueColor ? "RGB888" : "RGB565");
  esp_lcd_panel_io_handle_t io = nullptr;
  esp_lcd_panel_handle_t panel = nullptr;
  ESP_ERROR_CHECK(simcore_jc1060p470c_panel_initialize(&io, &panel));

  constexpr bool kPanelBuffers =
      SIMCORE_DISPLAY_RENDER_DIRECT != 0 || SIMCORE_DISPLAY_RENDER_FULL != 0;
  return {
      .io = io,
      .panel = panel,
      .horizontal_resolution = kHorizontalResolution,
      .vertical_resolution = kVerticalResolution,
      .buffer_size =
          kPanelBuffers
              ? kHorizontalResolution * kVerticalResolution
              : kHorizontalResolution *
                    (SIMCORE_DISPLAY_RENDER_FULL_STRIPS != 0 ? 60 : 40),
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
      .direct_mode = SIMCORE_DISPLAY_RENDER_DIRECT != 0,
      .full_refresh = SIMCORE_DISPLAY_RENDER_FULL != 0,
      .full_strips = SIMCORE_DISPLAY_RENDER_FULL_STRIPS != 0,
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
