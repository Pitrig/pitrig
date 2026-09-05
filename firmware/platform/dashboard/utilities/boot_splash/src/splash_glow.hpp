#pragma once

#include <cstdint>

#include "lvgl.h"

namespace pitrig::dashboard::boot_splash::glow {

struct Geometry {
  lv_obj_t* container{};
  std::int32_t x{};
  std::int32_t y{};
  std::int32_t width{};
  std::int32_t height{};
  std::int32_t thickness{};
  std::int32_t segment{};
  std::int32_t corner{};
};

void attach(const Geometry& geometry);

void detach();

}
