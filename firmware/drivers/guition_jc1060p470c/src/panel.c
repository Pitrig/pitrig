/*
 * SPDX-FileCopyrightText: 2024-2026 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: Apache-2.0
 *
 * The JC1060P470C JD9165 panel bring-up is derived from the Apache-2.0
 * esp32_p4_jc1060p470_board BSP.
 */

#include "panel.h"

#include <stddef.h>
#include <stdint.h>

#include "driver/gpio.h"
#include "esp_lcd_jd9165.h"
#include "esp_lcd_mipi_dsi.h"
#include "esp_lcd_panel_interface.h"
#include "esp_ldo_regulator.h"
#include "esp_system.h"
#include "panel_variants.h"
#include "sdkconfig.h"

#define LCD_BACKLIGHT ((gpio_num_t)PITRIG_JC1060P470C_BACKLIGHT_GPIO)
#define LCD_RESET GPIO_NUM_0
#define MIPI_DSI_LANE_COUNT 2
#define MIPI_DSI_LANE_BIT_RATE_MBPS 750
#define MIPI_DSI_PHY_LDO_CHANNEL 3
#define MIPI_DSI_PHY_LDO_VOLTAGE_MV 2500
#if defined(CONFIG_PITRIG_DISPLAY_RENDER_FULL_STRIPS)
#define LCD_FRAME_BUFFER_COUNT 3
#else
#define LCD_FRAME_BUFFER_COUNT 2
#endif
#ifdef CONFIG_PITRIG_DISPLAY_COLOR_24BIT
#define LCD_COLOR_FORMAT LCD_COLOR_FMT_RGB888
#define LCD_BITS_PER_PIXEL 24
#else
#define LCD_COLOR_FORMAT LCD_COLOR_FMT_RGB565
#define LCD_BITS_PER_PIXEL 16
#endif

static esp_ldo_channel_handle_t mipi_phy_power;
static esp_lcd_dsi_bus_handle_t mipi_dsi_bus;

static void disable_backlight_on_shutdown(void) { (void)gpio_set_level(LCD_BACKLIGHT, 0); }

static esp_err_t fixed_orientation_swap_xy(esp_lcd_panel_t* panel, bool swap_axes) {
  (void)panel;
  return swap_axes ? ESP_ERR_NOT_SUPPORTED : ESP_OK;
}

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

void pitrig_jc1060p470c_panel_release(esp_lcd_panel_io_handle_t* io,
                                      esp_lcd_panel_handle_t* panel) {
  if (panel != NULL && *panel != NULL) {
    (void)esp_lcd_panel_del(*panel);
    *panel = NULL;
  }
  if (io != NULL && *io != NULL) {
    (void)esp_lcd_panel_io_del(*io);
    *io = NULL;
  }
  if (mipi_dsi_bus != NULL) {
    (void)esp_lcd_del_dsi_bus(mipi_dsi_bus);
    mipi_dsi_bus = NULL;
  }
  if (mipi_phy_power != NULL) {
    (void)esp_ldo_release_channel(mipi_phy_power);
    mipi_phy_power = NULL;
  }
  (void)gpio_set_level(LCD_BACKLIGHT, 0);
}

esp_err_t pitrig_jc1060p470c_panel_initialize(esp_lcd_panel_io_handle_t* io,
                                              esp_lcd_panel_handle_t* panel,
                                              const uint8_t variant) {
  if (io == NULL || panel == NULL) {
    return ESP_ERR_INVALID_ARG;
  }
  const pitrig_jc1060p470c_panel_variant_t* const fitted =
      pitrig_jc1060p470c_panel_variant(variant);
  *io = NULL;
  *panel = NULL;

  esp_err_t result = initialize_backlight();
  if (result != ESP_OK) {
    return result;
  }
  result = esp_register_shutdown_handler(disable_backlight_on_shutdown);
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
    mipi_dsi_bus = NULL;
    pitrig_jc1060p470c_panel_release(io, panel);
    return result;
  }

  const esp_lcd_dbi_io_config_t io_config = {
      .virtual_channel = 0,
      .lcd_cmd_bits = 8,
      .lcd_param_bits = 8,
  };
  result = esp_lcd_new_panel_io_dbi(mipi_dsi_bus, &io_config, io);
  if (result != ESP_OK) {
    *io = NULL;
    pitrig_jc1060p470c_panel_release(io, panel);
    return result;
  }

  const esp_lcd_dpi_panel_config_t dpi_config = {
      .virtual_channel = 0,
      .dpi_clk_src = MIPI_DSI_DPI_CLK_SRC_DEFAULT,
      .dpi_clock_freq_mhz = fitted->pixel_clock_mhz,
      .in_color_format = LCD_COLOR_FORMAT,
      .num_fbs = LCD_FRAME_BUFFER_COUNT,
      .video_timing = fitted->timing,
  };

  const jd9165_vendor_config_t vendor_config = {
      .init_cmds = fitted->init_commands,
      .init_cmds_size = fitted->init_command_count,
      .mipi_config =
          {
              .dsi_bus = mipi_dsi_bus,
              .dpi_config = &dpi_config,
          },
  };
  const esp_lcd_panel_dev_config_t panel_config = {
      .reset_gpio_num = LCD_RESET,
      .rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB,
      .bits_per_pixel = LCD_BITS_PER_PIXEL,
      .vendor_config = (void*)&vendor_config,
  };
  result = esp_lcd_new_panel_jd9165(*io, &panel_config, panel);
  if (result != ESP_OK) {
    *panel = NULL;
    pitrig_jc1060p470c_panel_release(io, panel);
    return result;
  }
  (*panel)->swap_xy = fixed_orientation_swap_xy;
  result = esp_lcd_panel_reset(*panel);
  if (result == ESP_OK) {
    result = esp_lcd_panel_init(*panel);
  }
  if (result == ESP_OK) {
    result = esp_lcd_panel_disp_on_off(*panel, true);
  }
  if (result == ESP_OK) {
    result = esp_lcd_dpi_panel_enable_dma2d(*panel);
  }
  if (result != ESP_OK) {
    pitrig_jc1060p470c_panel_release(io, panel);
  }
  return result;
}

esp_err_t pitrig_jc1060p470c_backlight_on(void) { return gpio_set_level(LCD_BACKLIGHT, 1); }
