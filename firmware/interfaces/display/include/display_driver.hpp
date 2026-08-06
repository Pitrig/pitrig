#pragma once

#include <cstddef>
#include <cstdint>

#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"

namespace simcore::display::driver {

// ESP-IDF display-adapter contract shared by the generic LVGL display
// component and board drivers. It intentionally exposes esp_lcd handles; UI,
// modules, and application configuration must not depend on this interface.

enum class BusType : std::uint8_t {
  command,
  dsi,
  rgb,
};

enum class ColorFormat : std::uint8_t {
  rgb565,
  rgb888,
};

struct Configuration {
  esp_lcd_panel_io_handle_t io;
  esp_lcd_panel_handle_t panel;
  std::uint32_t horizontal_resolution;
  std::uint32_t vertical_resolution;
  std::size_t buffer_size;
  bool swap_xy;
  bool mirror_x;
  bool mirror_y;
  BusType bus_type;
  ColorFormat color_format;
  bool double_buffer;
  bool buffer_in_dma_memory;
  bool buffer_in_psram;
  bool avoid_tearing;
  bool direct_mode;
};

struct Driver {
  const char* name;
  Configuration (*initialize)();
  void (*on_display_ready)();
};

}  // namespace simcore::display::driver
