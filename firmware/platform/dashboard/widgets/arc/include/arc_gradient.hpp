#pragma once

#include <cstdint>

#include "lvgl.h"

namespace pitrig::dashboard::arc_widget::gradient {

struct Ramp {
  std::int32_t side{};
  std::int32_t thickness_px{};
  float start_deg{};
  float sector_deg{};
  bool inverted{};
  std::uint32_t from_rgb{};
  std::uint32_t to_rgb{};
};

[[nodiscard]] lv_draw_buf_t* prepare(const Ramp& ramp);

}
