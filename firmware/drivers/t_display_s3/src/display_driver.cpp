#include <array>

#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_log.h"
#include "t_display_s3_display_driver.hpp"

namespace pitrig::display::drivers::t_display_s3 {
namespace {

constexpr char kTag[] = "t_display_s3";
constexpr int kHorizontalResolution = 320;
constexpr int kVerticalResolution = 170;
constexpr int kBufferLines = 40;
constexpr int kPixelClockHz = 20'000'000;

constexpr gpio_num_t kPowerPin = GPIO_NUM_15;
constexpr gpio_num_t kBacklightPin = GPIO_NUM_38;
constexpr gpio_num_t kResetPin = GPIO_NUM_5;
constexpr gpio_num_t kChipSelectPin = GPIO_NUM_6;
constexpr gpio_num_t kDataCommandPin = GPIO_NUM_7;
constexpr gpio_num_t kWriteClockPin = GPIO_NUM_8;
constexpr gpio_num_t kReadPin = GPIO_NUM_9;
constexpr std::array<gpio_num_t, 8> kDataPins = {
    GPIO_NUM_39, GPIO_NUM_40, GPIO_NUM_41, GPIO_NUM_42,
    GPIO_NUM_45, GPIO_NUM_46, GPIO_NUM_47, GPIO_NUM_48,
};

struct Hardware {
  esp_lcd_i80_bus_handle_t bus;
  esp_lcd_panel_io_handle_t io;
  esp_lcd_panel_handle_t panel;
};

Hardware hardware;

void release() {
  if (hardware.panel != nullptr) {
    (void)esp_lcd_panel_del(hardware.panel);
    hardware.panel = nullptr;
  }
  if (hardware.io != nullptr) {
    (void)esp_lcd_panel_io_del(hardware.io);
    hardware.io = nullptr;
  }
  if (hardware.bus != nullptr) {
    (void)esp_lcd_del_i80_bus(hardware.bus);
    hardware.bus = nullptr;
  }
  (void)gpio_set_level(kBacklightPin, 0);
}

[[nodiscard]] bool enable_display_power() {
  const gpio_config_t output_config = {
      .pin_bit_mask = (1ULL << kPowerPin) | (1ULL << kBacklightPin) | (1ULL << kReadPin),
      .mode = GPIO_MODE_OUTPUT,
      .pull_up_en = GPIO_PULLUP_DISABLE,
      .pull_down_en = GPIO_PULLDOWN_DISABLE,
      .intr_type = GPIO_INTR_DISABLE,
  };

  return gpio_config(&output_config) == ESP_OK && gpio_set_level(kPowerPin, 1) == ESP_OK &&
         gpio_set_level(kBacklightPin, 0) == ESP_OK && gpio_set_level(kReadPin, 1) == ESP_OK;
}

driver::Configuration initialize_panel() {
  const esp_lcd_i80_bus_config_t bus_config = {
      .dc_gpio_num = kDataCommandPin,
      .wr_gpio_num = kWriteClockPin,
      .clk_src = LCD_CLK_SRC_DEFAULT,
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
          },
      .bus_width = 8,
      .max_transfer_bytes = kHorizontalResolution * kBufferLines * sizeof(uint16_t),
      .dma_burst_size = 64,
      .flags = {},
  };
  if (esp_lcd_new_i80_bus(&bus_config, &hardware.bus) != ESP_OK) {
    ESP_LOGE(kTag, "i80 bus is unavailable");
    release();
    return {};
  }

  const esp_lcd_panel_io_i80_config_t io_config = {
      .cs_gpio_num = kChipSelectPin,
      .pclk_hz = kPixelClockHz,
      .trans_queue_depth = 10,
      .on_color_trans_done = nullptr,
      .user_ctx = nullptr,
      .lcd_cmd_bits = 8,
      .lcd_param_bits = 8,
      .dc_levels =
          {
              .dc_idle_level = 0,
              .dc_cmd_level = 0,
              .dc_dummy_level = 0,
              .dc_data_level = 1,
          },
      .flags =
          {
              .cs_active_high = 0,
              .reverse_color_bits = 0,
              .swap_color_bytes = 0,
              .pclk_active_neg = 0,
              .pclk_idle_low = 0,
          },
  };
  if (esp_lcd_new_panel_io_i80(hardware.bus, &io_config, &hardware.io) != ESP_OK) {
    ESP_LOGE(kTag, "i80 panel IO is unavailable");
    release();
    return {};
  }

  const esp_lcd_panel_dev_config_t panel_config = {
      .rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB,
      .data_endian = LCD_RGB_DATA_ENDIAN_LITTLE,
      .bits_per_pixel = 16,
      .reset_gpio_num = kResetPin,
      .vendor_config = nullptr,
      .flags = {},
  };
  if (esp_lcd_new_panel_st7789(hardware.io, &panel_config, &hardware.panel) != ESP_OK) {
    ESP_LOGE(kTag, "ST7789 panel is unavailable");
    release();
    return {};
  }
  if (esp_lcd_panel_reset(hardware.panel) != ESP_OK ||
      esp_lcd_panel_init(hardware.panel) != ESP_OK ||
      esp_lcd_panel_invert_color(hardware.panel, true) != ESP_OK ||
      esp_lcd_panel_set_gap(hardware.panel, 0, 35) != ESP_OK ||
      esp_lcd_panel_disp_on_off(hardware.panel, true) != ESP_OK) {
    ESP_LOGE(kTag, "ST7789 panel did not come up");
    release();
    return {};
  }

  return {
      .io = hardware.io,
      .panel = hardware.panel,
      .horizontal_resolution = kHorizontalResolution,
      .vertical_resolution = kVerticalResolution,
      .buffer_size = kHorizontalResolution * kBufferLines,
      .swap_xy = true,
      .mirror_x = false,
      .mirror_y = true,
      .bus_type = driver::BusType::command,
      .color_format = driver::ColorFormat::rgb565,
      .double_buffer = true,
      .buffer_in_dma_memory = true,
      .buffer_in_psram = false,
      .bounce_buffers = false,
      .avoid_tearing = false,
      .direct_mode = false,
      .full_refresh = false,
      .full_strips = false,
  };
}

}

namespace {

driver::Configuration initialize() {
  ESP_LOGI(kTag, "Initializing ST7789 display driver");
  if (!enable_display_power()) {
    ESP_LOGE(kTag, "Display power pins are unavailable");
    return {};
  }
  return initialize_panel();
}

void on_display_ready() {
  if (gpio_set_level(kBacklightPin, 1) != ESP_OK) {
    ESP_LOGW(kTag, "Backlight did not turn on");
  }
  ESP_LOGI(kTag, "Display driver ready");
}

const driver::Driver kDriver{
    .name = "t_display_s3",
    .initialize = initialize,
    .release = release,
    .on_display_ready = on_display_ready,
};

}

const driver::Driver& get() { return kDriver; }

}
