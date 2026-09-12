#pragma once

#include <cstdint>

#include "lvgl.h"

namespace pitrig::dashboard::boot_splash {

class Glow final {
 public:
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

 private:
  static void draw_border(lv_event_t* event);
  static void set_phase(void* target, std::int32_t value);

  [[nodiscard]] lv_color_t hue_at(std::int32_t travelled, std::int32_t perimeter) const;
  void paint(lv_layer_t* layer) const;
  void invalidate_border() const;

  Geometry geometry_{};
  std::int32_t phase_deg_{};
};

}
