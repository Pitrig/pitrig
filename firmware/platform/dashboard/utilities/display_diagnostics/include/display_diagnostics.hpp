#pragma once

#include <cstdint>

#include "lvgl.h"

namespace simcore::dashboard::fonts {
class Registry;
}

namespace simcore::dashboard::display_diagnostics {

struct Config {
  bool auto_cycle{true};
  std::uint32_t page_duration_ms{5'000};
  std::uint8_t initial_page{0};
};

// Runs the full-screen display hardware diagnostic. Its pages exercise
// geometry, color channels, pixel transitions, font rendering, and refresh.
[[nodiscard]] bool create(lv_display_t* display, const Config& config,
                          const fonts::Registry& fonts);

}  // namespace simcore::dashboard::display_diagnostics
