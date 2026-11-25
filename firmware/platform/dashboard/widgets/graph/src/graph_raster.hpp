#pragma once

#include <cstdint>

#include "graph_widget.hpp"
#include "lvgl.h"

namespace pitrig::dashboard::graph_widget::raster {

struct Surface {
  std::uint8_t* pixels{};
  std::int32_t stride{};
  std::int32_t origin_x{};
  std::int32_t origin_y{};
  lv_color_format_t format{};
  lv_opa_t opa{};
};

struct Region {
  std::int32_t x1{};
  std::int32_t y1{};
  std::int32_t x2{};
  std::int32_t y2{};
};

[[nodiscard]] bool supports(lv_color_format_t format);

void paint(const State& state, const Surface& surface, const Region& region);

}
