#pragma once

#include "esp_err.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t simcore_jc1060p470c_panel_initialize(esp_lcd_panel_io_handle_t* io,
                                               esp_lcd_panel_handle_t* panel);
esp_err_t simcore_jc1060p470c_backlight_on(void);

#ifdef __cplusplus
}
#endif
