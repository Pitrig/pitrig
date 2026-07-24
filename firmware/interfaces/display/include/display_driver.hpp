#pragma once

#include <cstddef>
#include <cstdint>

#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"

namespace simcore::display::driver {

struct Configuration {
  esp_lcd_panel_io_handle_t io;
  esp_lcd_panel_handle_t panel;
  std::uint32_t horizontal_resolution;
  std::uint32_t vertical_resolution;
  std::size_t buffer_size;
  bool swap_xy;
  bool mirror_x;
  bool mirror_y;
};

// Initializes the hardware driver selected by the firmware build.
[[nodiscard]] Configuration initialize();
// Notifies the hardware driver after LVGL has registered the display.
void on_display_ready();

}  // namespace simcore::display::driver
