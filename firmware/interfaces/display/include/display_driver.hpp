#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "display_color_profile.hpp"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"

namespace pitrig::display::driver {

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
  bool bounce_buffers;
  bool avoid_tearing;
  bool direct_mode;
  bool full_refresh;
  bool full_strips;
};

[[nodiscard]] constexpr bool succeeded(const Configuration& configuration) {
  return configuration.panel != nullptr;
}

struct Panel {
  const ColorProfile* color_profile{};
};

struct Driver {
  const char* name;
  Configuration (*initialize)(std::uint8_t panel);
  void (*release)();
  void (*on_display_ready)();
  int backlight_pin{-1};
  std::span<const Panel> panels{};
};

[[nodiscard]] constexpr std::uint8_t panel_count(const Driver& driver) {
  return driver.panels.empty() ? 1 : static_cast<std::uint8_t>(driver.panels.size());
}

[[nodiscard]] constexpr const ColorProfile* color_profile(const Driver& driver,
                                                          const std::uint8_t panel) {
  return panel < driver.panels.size() ? driver.panels[panel].color_profile : nullptr;
}

}
