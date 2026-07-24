#include "lap_timer.hpp"

#include <cstdio>

#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::lap_timer {

lv_obj_t* create(lv_display_t* display) {
  lvgl_port_lock(0);
  lv_obj_t* label = lv_label_create(lv_display_get_screen_active(display));
  lv_obj_set_style_text_font(label, &lv_font_montserrat_48, LV_PART_MAIN);
  lv_obj_center(label);
  lvgl_port_unlock();
  return label;
}

void set_time(lv_obj_t* label, const std::uint32_t milliseconds) {
  constexpr std::uint32_t kMillisecondsPerSecond = 1'000;
  constexpr std::uint32_t kSecondsPerMinute = 60;

  const std::uint32_t total_seconds = milliseconds / kMillisecondsPerSecond;
  const std::uint32_t minutes = total_seconds / kSecondsPerMinute;
  const std::uint32_t seconds = total_seconds % kSecondsPerMinute;
  const std::uint32_t remaining_milliseconds = milliseconds % kMillisecondsPerSecond;

  char text[16];
  std::snprintf(text, sizeof(text), "%02lu:%02lu.%03lu", static_cast<unsigned long>(minutes),
                static_cast<unsigned long>(seconds),
                static_cast<unsigned long>(remaining_milliseconds));

  lvgl_port_lock(0);
  lv_label_set_text(label, text);
  lv_obj_center(label);
  lvgl_port_unlock();
}

}  // namespace simcore::lap_timer
