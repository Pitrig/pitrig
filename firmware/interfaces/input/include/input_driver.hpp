#pragma once

#include "esp_lcd_touch.h"

namespace pitrig::input::driver {

struct Configuration {
  esp_lcd_touch_handle_t touch;
};

struct Driver {
  const char* name;
  Configuration (*initialize)();
};

}
