#pragma once

#include "lvgl.h"

namespace pitrig::dashboard {

inline void release_draw_buffer(lv_event_t* const event) {
  auto* const buffer = static_cast<lv_draw_buf_t*>(lv_event_get_user_data(event));
  if (buffer != nullptr) {
    lv_draw_buf_destroy(buffer);
  }
}

}
