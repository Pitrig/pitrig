#pragma once

#include <cstdint>

#include "fill_ramp.hpp"
#include "lvgl.h"

namespace pitrig::dashboard::arc_widget::gradient {

struct Ramp {
  std::int32_t side{};
  std::int32_t thickness_px{};
  float start_deg{};
  float sector_deg{};
  bool inverted{};
  fill::Ramp colours{};
};

[[nodiscard]] lv_draw_buf_t* prepare(const Ramp& ramp);

}
