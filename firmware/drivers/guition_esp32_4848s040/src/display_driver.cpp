#include <array>
#include <cstddef>
#include <cstdint>

#include "driver/gpio.h"
#include "display_driver.hpp"
#include "esp_err.h"
#include "esp_lcd_panel_io_additions.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_rgb.h"
#include "esp_lcd_st7701.h"
#include "esp_log.h"
#include "guition_display_driver.hpp"

namespace simcore::display::drivers::guition_esp32_4848s040 {
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
    GPIO_NUM_4,  GPIO_NUM_5,  GPIO_NUM_6,  GPIO_NUM_7,
    GPIO_NUM_15, GPIO_NUM_8,  GPIO_NUM_20, GPIO_NUM_3,
    GPIO_NUM_46, GPIO_NUM_9,  GPIO_NUM_10, GPIO_NUM_11,
    GPIO_NUM_12, GPIO_NUM_13, GPIO_NUM_14, GPIO_NUM_0,
};

constexpr std::uint8_t kBank0[] = {0x77, 0x01, 0x00, 0x00, 0x10};
constexpr std::uint8_t kLineSetting[] = {0x3B, 0x00};
constexpr std::uint8_t kPorchControl[] = {0x0D, 0x02};
constexpr std::uint8_t kInversionControl[] = {0x31, 0x05};
constexpr std::uint8_t kRgbControl[] = {0x00};
constexpr std::uint8_t kPositiveGamma[] = {
    0x00, 0x11, 0x18, 0x0E, 0x11, 0x06, 0x07, 0x08,
    0x07, 0x22, 0x04, 0x12, 0x0F, 0xAA, 0x31, 0x18,
};
constexpr std::uint8_t kNegativeGamma[] = {
    0x00, 0x11, 0x19, 0x0E, 0x12, 0x07, 0x08, 0x08,
    0x08, 0x22, 0x04, 0x11, 0x11, 0xA9, 0x32, 0x18,
};
constexpr std::uint8_t kBank1[] = {0x77, 0x01, 0x00, 0x00, 0x11};
constexpr std::uint8_t kVop[] = {0x60};
constexpr std::uint8_t kVcom[] = {0x32};
constexpr std::uint8_t kVgh[] = {0x07};
constexpr std::uint8_t kTestCommand[] = {0x80};
constexpr std::uint8_t kVgl[] = {0x49};
constexpr std::uint8_t kPowerControl1[] = {0x85};
constexpr std::uint8_t kPowerControl2[] = {0x21};
constexpr std::uint8_t kVdv[] = {0x78};
constexpr std::uint8_t kVrh[] = {0x78};
constexpr std::uint8_t kPowerControl3[] = {0x00, 0x1B, 0x02};
constexpr std::uint8_t kEqualize1[] = {
    0x08, 0xA0, 0x00, 0x00, 0x07, 0xA0, 0x00, 0x00, 0x00, 0x44, 0x44,
};
constexpr std::uint8_t kEqualize2[] = {
    0x11, 0x11, 0x44, 0x44, 0xED, 0xA0,
    0x00, 0x00, 0xEC, 0xA0, 0x00, 0x00,
};
constexpr std::uint8_t kEqualize3[] = {0x00, 0x00, 0x11, 0x11};
constexpr std::uint8_t kEqualize4[] = {0x44, 0x44};
constexpr std::uint8_t kEqualize5[] = {
    0x0A, 0xE9, 0xD8, 0xA0, 0x0C, 0xEB, 0xD8, 0xA0,
    0x0E, 0xED, 0xD8, 0xA0, 0x10, 0xEF, 0xD8, 0xA0,
};
constexpr std::uint8_t kEqualize6[] = {0x00, 0x00, 0x11, 0x11};
constexpr std::uint8_t kEqualize7[] = {0x44, 0x44};
constexpr std::uint8_t kEqualize8[] = {
    0x09, 0xE8, 0xD8, 0xA0, 0x0B, 0xEA, 0xD8, 0xA0,
    0x0D, 0xEC, 0xD8, 0xA0, 0x0F, 0xEE, 0xD8, 0xA0,
};
constexpr std::uint8_t kEqualize9[] = {0x02, 0x00, 0xE4, 0xE4,
                                       0x88, 0x00, 0x40};
constexpr std::uint8_t kEqualize10[] = {0x3C, 0x00};
constexpr std::uint8_t kEqualize11[] = {
    0xAB, 0x89, 0x76, 0x54, 0x02, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0x20, 0x45, 0x67, 0x98, 0xBA,
};
constexpr std::uint8_t kBank3[] = {0x77, 0x01, 0x00, 0x00, 0x13};
constexpr std::uint8_t kGateControl[] = {0xE4};
constexpr std::uint8_t kCommand2Disabled[] = {0x77, 0x01, 0x00, 0x00, 0x00};
constexpr std::uint8_t kControllerColorMode[] = {0x60};

constexpr st7701_lcd_init_cmd_t kInitializationCommands[] = {
    {0xFF, kBank0, sizeof(kBank0), 0},
    {0xC0, kLineSetting, sizeof(kLineSetting), 0},
    {0xC1, kPorchControl, sizeof(kPorchControl), 0},
    {0xC2, kInversionControl, sizeof(kInversionControl), 0},
    {0xCD, kRgbControl, sizeof(kRgbControl), 0},
    {0xB0, kPositiveGamma, sizeof(kPositiveGamma), 0},
    {0xB1, kNegativeGamma, sizeof(kNegativeGamma), 0},
    {0xFF, kBank1, sizeof(kBank1), 0},
    {0xB0, kVop, sizeof(kVop), 0},
    {0xB1, kVcom, sizeof(kVcom), 0},
    {0xB2, kVgh, sizeof(kVgh), 0},
    {0xB3, kTestCommand, sizeof(kTestCommand), 0},
    {0xB5, kVgl, sizeof(kVgl), 0},
    {0xB7, kPowerControl1, sizeof(kPowerControl1), 0},
    {0xB8, kPowerControl2, sizeof(kPowerControl2), 0},
    {0xC1, kVdv, sizeof(kVdv), 0},
    {0xC2, kVrh, sizeof(kVrh), 0},
    {0xE0, kPowerControl3, sizeof(kPowerControl3), 0},
    {0xE1, kEqualize1, sizeof(kEqualize1), 0},
    {0xE2, kEqualize2, sizeof(kEqualize2), 0},
    {0xE3, kEqualize3, sizeof(kEqualize3), 0},
    {0xE4, kEqualize4, sizeof(kEqualize4), 0},
    {0xE5, kEqualize5, sizeof(kEqualize5), 0},
    {0xE6, kEqualize6, sizeof(kEqualize6), 0},
    {0xE7, kEqualize7, sizeof(kEqualize7), 0},
    {0xE8, kEqualize8, sizeof(kEqualize8), 0},
    {0xEB, kEqualize9, sizeof(kEqualize9), 0},
    {0xEC, kEqualize10, sizeof(kEqualize10), 0},
    {0xED, kEqualize11, sizeof(kEqualize11), 0},
    {0xFF, kBank3, sizeof(kBank3), 0},
    {0xE5, kGateControl, sizeof(kGateControl), 0},
    {0xFF, kCommand2Disabled, sizeof(kCommand2Disabled), 0},
    {0x3A, kControllerColorMode, sizeof(kControllerColorMode), 0},
    {0x11, nullptr, 0, 120},
    {0x29, nullptr, 0, 0},
};

void configure_backlight() {
  const gpio_config_t output_config = {
      .pin_bit_mask = 1ULL << kBacklightPin,
      .mode = GPIO_MODE_OUTPUT,
      .pull_up_en = GPIO_PULLUP_DISABLE,
      .pull_down_en = GPIO_PULLDOWN_DISABLE,
      .intr_type = GPIO_INTR_DISABLE,
  };
  ESP_ERROR_CHECK(gpio_config(&output_config));
  ESP_ERROR_CHECK(gpio_set_level(kBacklightPin, 0));
}

esp_lcd_panel_io_handle_t initialize_command_io() {
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
  ESP_ERROR_CHECK(esp_lcd_new_panel_io_3wire_spi(&io_config, &io));
  return io;
}

esp_lcd_panel_handle_t initialize_panel(esp_lcd_panel_io_handle_t io) {
  const esp_lcd_rgb_panel_config_t rgb_config = {
      .clk_src = LCD_CLK_SRC_DEFAULT,
      .timings = {
          .pclk_hz = kPixelClockHz,
          .h_res = kHorizontalResolution,
          .v_res = kVerticalResolution,
          .hsync_pulse_width = 8,
          .hsync_back_porch = 50,
          .hsync_front_porch = 10,
          .vsync_pulse_width = 8,
          .vsync_back_porch = 20,
          .vsync_front_porch = 10,
          .flags = {
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
      .data_gpio_nums = {
          kDataPins[0],  kDataPins[1],  kDataPins[2],  kDataPins[3],
          kDataPins[4],  kDataPins[5],  kDataPins[6],  kDataPins[7],
          kDataPins[8],  kDataPins[9],  kDataPins[10], kDataPins[11],
          kDataPins[12], kDataPins[13], kDataPins[14], kDataPins[15],
      },
      .flags = {
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
      .flags = {
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
  ESP_ERROR_CHECK(esp_lcd_new_panel_st7701(io, &panel_config, &panel));
  ESP_ERROR_CHECK(esp_lcd_panel_reset(panel));
  ESP_ERROR_CHECK(esp_lcd_panel_init(panel));
  ESP_ERROR_CHECK(esp_lcd_panel_disp_on_off(panel, true));
  return panel;
}

}

namespace {

driver::Configuration initialize() {
  ESP_LOGI(kTag, "Initializing 480x480 ST7701(S) RGB display");
  configure_backlight();
  const esp_lcd_panel_io_handle_t io = initialize_command_io();
  const esp_lcd_panel_handle_t panel = initialize_panel(io);

  return {
      .io = nullptr,
      .panel = panel,
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
  ESP_ERROR_CHECK(gpio_set_level(kBacklightPin, 1));
  ESP_LOGI(kTag, "Display driver ready");
}

const driver::Driver kDriver{
    .name = "guition_esp32_4848s040",
    .initialize = initialize,
    .on_display_ready = on_display_ready,
};

}

const driver::Driver& get() {
  return kDriver;
}

}
