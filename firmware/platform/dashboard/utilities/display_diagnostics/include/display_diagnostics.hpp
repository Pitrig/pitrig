#pragma once

#include <cstdint>

#include "lvgl.h"

namespace simcore::dashboard::fonts {
class Registry;
}

namespace simcore::dashboard::display_diagnostics {

struct ViewImplementation;

struct Config {
  bool auto_cycle{true};
  std::uint32_t page_duration_ms{2'000};
  std::uint32_t fps_page_duration_ms{60'000};
  std::uint8_t initial_page{0};
};

// Owns the full-screen display hardware diagnostic, including its LVGL timer,
// objects, and RGB888 stress buffer.
class View final {
 public:
  View() = default;
  ~View();
  View(const View&) = delete;
  View& operator=(const View&) = delete;

  [[nodiscard]] bool create(lv_display_t* display, lv_obj_t* screen,
                            const Config& config,
                            const fonts::Registry& fonts);
  void destroy();

 private:
  ViewImplementation* implementation_{};
};

}  // namespace simcore::dashboard::display_diagnostics
