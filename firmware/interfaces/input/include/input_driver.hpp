#pragma once

#include "esp_lcd_touch.h"

namespace simcore::input::driver {

// ESP-IDF input-adapter contract shared by the generic LVGL input component and
// board drivers. Like the display contract it intentionally exposes an esp_lcd
// handle; UI, modules, and application configuration must not depend on this
// interface.

struct Configuration {
  esp_lcd_touch_handle_t touch;
};

struct Driver {
  const char* name;
  Configuration (*initialize)();
};

}  // namespace simcore::input::driver
