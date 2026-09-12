#include "display_driver.hpp"

#include <array>
#include <cstddef>
#include <cstdint>

#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_lcd_panel_io_additions.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_rgb.h"
#include "esp_lcd_st7701.h"
#include "esp_log.h"
#include "guition_display_driver.hpp"
#include "st7701_init_commands.hpp"

namespace pitrig::display::drivers::guition_esp32_4848s040 {
namespace {

constexpr char kTag[] = "guition_4848s040";
constexpr std::uint32_t kHorizontalResolution = 480;
constexpr std::uint32_t kVerticalResolution = 480;
constexpr std::uint32_t kPixelClockHz = 16'000'000;

constexpr gpio_num_t kBacklightPin = GPIO_NUM_38;
constexpr gpio_num_t kSpiChipSelectPin = GPIO_NUM_39;
constexpr gpio_num_t kSpiClockPin = GPIO_NUM_48;
constexpr gpio_num_t kSpiDataPin = GPIO_NUM_47;
constexpr gpio_num_t kDataEnablePin = GPIO_NUM_18;
constexpr gpio_num_t kVerticalSyncPin = GPIO_NUM_17;
constexpr gpio_num_t kHorizontalSyncPin = GPIO_NUM_16;
constexpr gpio_num_t kPixelClockPin = GPIO_NUM_21;
constexpr std::array<gpio_num_t, 16> kDataPins = {
    GPIO_NUM_4,  GPIO_NUM_5,  GPIO_NUM_6,  GPIO_NUM_7, GPIO_NUM_15, GPIO_NUM_8,
    GPIO_NUM_20, GPIO_NUM_3,  GPIO_NUM_46, GPIO_NUM_9, GPIO_NUM_10, GPIO_NUM_11,
    GPIO_NUM_12, GPIO_NUM_13, GPIO_NUM_14, GPIO_NUM_0,
};

struct Hardware {
  esp_lcd_panel_io_handle_t io;
  esp_lcd_panel_handle_t panel;
};

Hardware hardware;

[[nodiscard]] bool configure_backlight() {
  const gpio_config_t output_config = {
      .pin_bit_mask = 1ULL << kBacklightPin,
      .mode = GPIO_MODE_OUTPUT,
      .pull_up_en = GPIO_PULLUP_DISABLE,
      .pull_down_en = GPIO_PULLDOWN_DISABLE,
      .intr_type = GPIO_INTR_DISABLE,
  };
  return gpio_config(&output_config) == ESP_OK && gpio_set_level(kBacklightPin, 0) == ESP_OK;
}

[[nodiscard]] esp_lcd_panel_io_handle_t create_command_io() {
  const spi_line_config_t line_config = {
      .cs_io_type = IO_TYPE_GPIO,
      .cs_gpio_num = kSpiChipSelectPin,
      .scl_io_type = IO_TYPE_GPIO,
      .scl_gpio_num = kSpiClockPin,
      .sda_io_type = IO_TYPE_GPIO,
      .sda_gpio_num = kSpiDataPin,
      .io_expander = nullptr,
  };
  const esp_lcd_panel_io_3wire_spi_config_t io_config =
      ST7701_PANEL_IO_3WIRE_SPI_CONFIG(line_config, 0);

  esp_lcd_panel_io_handle_t io = nullptr;
  if (esp_lcd_new_panel_io_3wire_spi(&io_config, &io) != ESP_OK) {
    return nullptr;
  }
  return io;
}

[[nodiscard]] esp_lcd_panel_handle_t create_panel(const esp_lcd_panel_io_handle_t io) {
  const esp_lcd_rgb_panel_config_t rgb_config = {
      .clk_src = LCD_CLK_SRC_DEFAULT,
      .timings =
          {
              .pclk_hz = kPixelClockHz,
              .h_res = kHorizontalResolution,
              .v_res = kVerticalResolution,
              .hsync_pulse_width = 8,
              .hsync_back_porch = 50,
              .hsync_front_porch = 10,
              .vsync_pulse_width = 8,
              .vsync_back_porch = 20,
              .vsync_front_porch = 10,
              .flags =
                  {
                      .hsync_idle_low = false,
                      .vsync_idle_low = false,
                      .de_idle_high = false,
                      .pclk_active_neg = false,
                      .pclk_idle_high = false,
                  },
          },
      .data_width = 16,
      .in_color_format = LCD_COLOR_FMT_RGB565,
      .out_color_format = LCD_COLOR_FMT_RGB565,
      .num_fbs = 2,
      .user_fbs = {},
      .bounce_buffer_size_px = kHorizontalResolution * 20,
      .dma_burst_size = 64,
      .hsync_gpio_num = kHorizontalSyncPin,
      .vsync_gpio_num = kVerticalSyncPin,
      .de_gpio_num = kDataEnablePin,
      .pclk_gpio_num = kPixelClockPin,
      .disp_gpio_num = GPIO_NUM_NC,
      .data_gpio_nums =
          {
              kDataPins[0],
              kDataPins[1],
              kDataPins[2],
              kDataPins[3],
              kDataPins[4],
              kDataPins[5],
              kDataPins[6],
              kDataPins[7],
              kDataPins[8],
              kDataPins[9],
              kDataPins[10],
              kDataPins[11],
              kDataPins[12],
              kDataPins[13],
              kDataPins[14],
              kDataPins[15],
          },
      .flags =
          {
              .disp_active_low = false,
              .refresh_on_demand = false,
              .fb_in_psram = true,
              .double_fb = false,
              .no_fb = false,
              .bb_invalidate_cache = false,
          },
  };
  st7701_vendor_config_t vendor_config = {
      .init_cmds = kInitializationCommands,
      .init_cmds_size = std::size(kInitializationCommands),
      .rgb_config = &rgb_config,
      .flags =
          {
              .use_mipi_interface = false,
              .mirror_by_cmd = false,
              .enable_io_multiplex = false,
          },
  };
  const esp_lcd_panel_dev_config_t panel_config = {
      .rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB,
      .data_endian = LCD_RGB_DATA_ENDIAN_LITTLE,
      .bits_per_pixel = 16,
      .reset_gpio_num = GPIO_NUM_NC,
      .vendor_config = &vendor_config,
      .flags = {},
  };

  esp_lcd_panel_handle_t panel = nullptr;
  if (esp_lcd_new_panel_st7701(io, &panel_config, &panel) != ESP_OK) {
    return nullptr;
  }
  if (esp_lcd_panel_reset(panel) != ESP_OK || esp_lcd_panel_init(panel) != ESP_OK ||
      esp_lcd_panel_disp_on_off(panel, true) != ESP_OK) {
    (void)esp_lcd_panel_del(panel);
    return nullptr;
  }
  return panel;
}

}

namespace {

void release() {
  if (hardware.panel != nullptr) {
    (void)esp_lcd_panel_del(hardware.panel);
    hardware.panel = nullptr;
  }
  if (hardware.io != nullptr) {
    (void)esp_lcd_panel_io_del(hardware.io);
    hardware.io = nullptr;
  }
  (void)gpio_set_level(kBacklightPin, 0);
}

driver::Configuration initialize() {
  ESP_LOGI(kTag, "Initializing 480x480 ST7701(S) RGB display");
  if (!configure_backlight()) {
    ESP_LOGE(kTag, "Backlight pin is unavailable");
    return {};
  }
  hardware.io = create_command_io();
  if (hardware.io == nullptr) {
    ESP_LOGE(kTag, "Three-wire SPI command bus is unavailable");
    release();
    return {};
  }
  hardware.panel = create_panel(hardware.io);
  if (hardware.panel == nullptr) {
    ESP_LOGE(kTag, "ST7701 panel did not come up");
    release();
    return {};
  }

  return {
      .io = nullptr,
      .panel = hardware.panel,
      .horizontal_resolution = kHorizontalResolution,
      .vertical_resolution = kVerticalResolution,
      .buffer_size = kHorizontalResolution * 40,
      .swap_xy = false,
      .mirror_x = false,
      .mirror_y = false,
      .bus_type = driver::BusType::rgb,
      .color_format = driver::ColorFormat::rgb565,
      .double_buffer = true,
      .buffer_in_dma_memory = true,
      .buffer_in_psram = false,
      .bounce_buffers = true,
      .avoid_tearing = false,
      .direct_mode = false,
      .full_refresh = false,
      .full_strips = false,
  };
}

void on_display_ready() {
  if (gpio_set_level(kBacklightPin, 1) != ESP_OK) {
    ESP_LOGW(kTag, "Backlight did not turn on");
  }
  ESP_LOGI(kTag, "Display driver ready");
}

const driver::Driver kDriver{
    .name = "guition_esp32_4848s040",
    .initialize = initialize,
    .release = release,
    .on_display_ready = on_display_ready,
};

}

const driver::Driver& get() { return kDriver; }

}
