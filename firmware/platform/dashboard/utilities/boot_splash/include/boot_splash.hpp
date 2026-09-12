#pragma once

#include <cstdint>

#include "splash_glow.hpp"

namespace pitrig::dashboard::boot_splash {

class Splash final {
 public:
  Splash() = default;
  Splash(const Splash&) = delete;
  Splash& operator=(const Splash&) = delete;

  [[nodiscard]] bool show(lv_display_t* display, lv_obj_t* layer);

  void dismiss(std::uint32_t minimum_visible_ms);

 private:
  [[nodiscard]] bool build(lv_display_t* display, lv_obj_t* layer, const lv_image_dsc_t& asset);
  [[nodiscard]] bool claim();
  void release();

  Glow glow_{};
  lv_obj_t* container_{};
  std::uint32_t shown_tick_{};
  bool dismissing_{};
};

}
