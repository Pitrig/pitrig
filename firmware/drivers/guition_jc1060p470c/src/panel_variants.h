#pragma once

#include <stdint.h>

#include "esp_lcd_jd9165.h"
#include "esp_lcd_types.h"

typedef struct {
  const jd9165_lcd_init_cmd_t* init_commands;
  uint16_t init_command_count;
  float pixel_clock_mhz;
  esp_lcd_video_timing_t timing;
} pitrig_jc1060p470c_panel_variant_t;

const pitrig_jc1060p470c_panel_variant_t* pitrig_jc1060p470c_panel_variant(uint8_t panel);
