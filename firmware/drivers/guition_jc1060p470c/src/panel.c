/*
 * SPDX-FileCopyrightText: 2024-2026 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: Apache-2.0
 *
 * The JC1060P470C JD9165 initialization sequence and verified panel settings
 * are derived from the Apache-2.0 esp32_p4_jc1060p470_board BSP.
 */

#include "panel.h"

#include <stddef.h>
#include <stdint.h>

#include "driver/gpio.h"
#include "esp_lcd_jd9165.h"
#include "esp_lcd_mipi_dsi.h"
#include "esp_ldo_regulator.h"

#define LCD_BACKLIGHT GPIO_NUM_23
#define LCD_RESET GPIO_NUM_27
#define MIPI_DSI_LANE_COUNT 2
#define MIPI_DSI_LANE_BIT_RATE_MBPS 550
#define MIPI_DSI_PHY_LDO_CHANNEL 3
#define MIPI_DSI_PHY_LDO_VOLTAGE_MV 2500
#define LCD_FRAME_BUFFER_COUNT 2

static esp_ldo_channel_handle_t mipi_phy_power;
static esp_lcd_dsi_bus_handle_t mipi_dsi_bus;

static const jd9165_lcd_init_cmd_t panel_init_commands[] = {
    {0x30, (uint8_t[]){0x00}, 1, 0},
    {0xF7, (uint8_t[]){0x49, 0x61, 0x02, 0x00}, 4, 0},
    {0x30, (uint8_t[]){0x01}, 1, 0},
    {0x04, (uint8_t[]){0x0C}, 1, 0},
    {0x05, (uint8_t[]){0x00}, 1, 0},
    {0x06, (uint8_t[]){0x00}, 1, 0},
    {0x0B, (uint8_t[]){0x11}, 1, 0},
    {0x17, (uint8_t[]){0x00}, 1, 0},
    {0x20, (uint8_t[]){0x04}, 1, 0},
    {0x1F, (uint8_t[]){0x05}, 1, 0},
    {0x23, (uint8_t[]){0x00}, 1, 0},
    {0x25, (uint8_t[]){0x19}, 1, 0},
    {0x28, (uint8_t[]){0x18}, 1, 0},
    {0x29, (uint8_t[]){0x04}, 1, 0},
    {0x2A, (uint8_t[]){0x01}, 1, 0},
    {0x2B, (uint8_t[]){0x04}, 1, 0},
    {0x2C, (uint8_t[]){0x01}, 1, 0},
    {0x30, (uint8_t[]){0x02}, 1, 0},
    {0x01, (uint8_t[]){0x22}, 1, 0},
    {0x03, (uint8_t[]){0x12}, 1, 0},
    {0x04, (uint8_t[]){0x00}, 1, 0},
    {0x05, (uint8_t[]){0x64}, 1, 0},
    {0x0A, (uint8_t[]){0x08}, 1, 0},
    {0x0B, (uint8_t[]){0x0A, 0x1A, 0x0B, 0x0D, 0x0D, 0x11, 0x10, 0x06, 0x08, 0x1F, 0x1D}, 11, 0},
    {0x0C, (uint8_t[]){0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D}, 11, 0},
    {0x0D, (uint8_t[]){0x16, 0x1B, 0x0B, 0x0D, 0x0D, 0x11, 0x10, 0x07, 0x09, 0x1E, 0x1C}, 11, 0},
    {0x0E, (uint8_t[]){0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D}, 11, 0},
    {0x0F, (uint8_t[]){0x16, 0x1B, 0x0D, 0x0B, 0x0D, 0x11, 0x10, 0x1C, 0x1E, 0x09, 0x07}, 11, 0},
    {0x10, (uint8_t[]){0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D}, 11, 0},
    {0x11, (uint8_t[]){0x0A, 0x1A, 0x0D, 0x0B, 0x0D, 0x11, 0x10, 0x1D, 0x1F, 0x08, 0x06}, 11, 0},
    {0x12, (uint8_t[]){0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D}, 11, 0},
    {0x14, (uint8_t[]){0x00, 0x00, 0x11, 0x11}, 4, 0},
    {0x18, (uint8_t[]){0x99}, 1, 0},
    {0x30, (uint8_t[]){0x06}, 1, 0},
    {0x12,
     (uint8_t[]){0x36, 0x2C, 0x2E, 0x3C, 0x38, 0x35, 0x35, 0x32, 0x2E, 0x1D, 0x2B, 0x21, 0x16,
                 0x29},
     14, 0},
    {0x13,
     (uint8_t[]){0x36, 0x2C, 0x2E, 0x3C, 0x38, 0x35, 0x35, 0x32, 0x2E, 0x1D, 0x2B, 0x21, 0x16,
                 0x29},
     14, 0},
    {0x30, (uint8_t[]){0x0A}, 1, 0},
    {0x02, (uint8_t[]){0x4F}, 1, 0},
    {0x0B, (uint8_t[]){0x40}, 1, 0},
    {0x12, (uint8_t[]){0x3E}, 1, 0},
    {0x13, (uint8_t[]){0x78}, 1, 0},
    {0x30, (uint8_t[]){0x0D}, 1, 0},
    {0x0D, (uint8_t[]){0x04}, 1, 0},
    {0x10, (uint8_t[]){0x0C}, 1, 0},
    {0x11, (uint8_t[]){0x0C}, 1, 0},
    {0x12, (uint8_t[]){0x0C}, 1, 0},
    {0x13, (uint8_t[]){0x0C}, 1, 0},
    {0x30, (uint8_t[]){0x00}, 1, 0},
    {0x11, (uint8_t[]){0x00}, 1, 120},
    {0x29, (uint8_t[]){0x00}, 1, 50},
};

static esp_err_t initialize_backlight(void) {
  const gpio_config_t config = {
      .pin_bit_mask = 1ULL << LCD_BACKLIGHT,
      .mode = GPIO_MODE_OUTPUT,
      .pull_up_en = GPIO_PULLUP_DISABLE,
      .pull_down_en = GPIO_PULLDOWN_DISABLE,
      .intr_type = GPIO_INTR_DISABLE,
  };
  esp_err_t result = gpio_config(&config);
  if (result == ESP_OK) {
    result = gpio_set_level(LCD_BACKLIGHT, 0);
  }
  return result;
}

static esp_err_t enable_mipi_phy_power(void) {
  if (mipi_phy_power != NULL) {
    return ESP_OK;
  }
  const esp_ldo_channel_config_t config = {
      .chan_id = MIPI_DSI_PHY_LDO_CHANNEL,
      .voltage_mv = MIPI_DSI_PHY_LDO_VOLTAGE_MV,
  };
  return esp_ldo_acquire_channel(&config, &mipi_phy_power);
}

esp_err_t simcore_jc1060p470c_panel_initialize(esp_lcd_panel_io_handle_t* io,
                                               esp_lcd_panel_handle_t* panel) {
  if (io == NULL || panel == NULL) {
    return ESP_ERR_INVALID_ARG;
  }

  esp_err_t result = initialize_backlight();
  if (result != ESP_OK) {
    return result;
  }
  result = enable_mipi_phy_power();
  if (result != ESP_OK) {
    return result;
  }

  const esp_lcd_dsi_bus_config_t bus_config = {
      .bus_id = 0,
      .num_data_lanes = MIPI_DSI_LANE_COUNT,
      .phy_clk_src = MIPI_DSI_PHY_CLK_SRC_DEFAULT,
      .lane_bit_rate_mbps = MIPI_DSI_LANE_BIT_RATE_MBPS,
  };
  result = esp_lcd_new_dsi_bus(&bus_config, &mipi_dsi_bus);
  if (result != ESP_OK) {
    return result;
  }

  const esp_lcd_dbi_io_config_t io_config = {
      .virtual_channel = 0,
      .lcd_cmd_bits = 8,
      .lcd_param_bits = 8,
  };
  result = esp_lcd_new_panel_io_dbi(mipi_dsi_bus, &io_config, io);
  if (result != ESP_OK) {
    return result;
  }

  esp_lcd_dpi_panel_config_t dpi_config =
      JD9165_1024_600_PANEL_60HZ_DPI_CONFIG_CF(LCD_COLOR_FMT_RGB565);
  dpi_config.num_fbs = LCD_FRAME_BUFFER_COUNT;

  const jd9165_vendor_config_t vendor_config = {
      .init_cmds = panel_init_commands,
      .init_cmds_size = sizeof(panel_init_commands) / sizeof(panel_init_commands[0]),
      .mipi_config =
          {
              .dsi_bus = mipi_dsi_bus,
              .dpi_config = &dpi_config,
          },
  };
  const esp_lcd_panel_dev_config_t panel_config = {
      .reset_gpio_num = LCD_RESET,
      .rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB,
      .bits_per_pixel = 16,
      .vendor_config = (void*)&vendor_config,
  };
  result = esp_lcd_new_panel_jd9165(*io, &panel_config, panel);
  if (result != ESP_OK) {
    return result;
  }
  result = esp_lcd_panel_reset(*panel);
  if (result == ESP_OK) {
    result = esp_lcd_panel_init(*panel);
  }
  if (result == ESP_OK) {
    result = esp_lcd_panel_disp_on_off(*panel, true);
  }
  return result;
}

esp_err_t simcore_jc1060p470c_backlight_on(void) { return gpio_set_level(LCD_BACKLIGHT, 1); }
