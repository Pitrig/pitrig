#pragma once

#include <cstdint>

#include "dashboard_layout.hpp"

namespace simcore::lap_timer {
class LapTimer;
}

namespace simcore::dashboard::fonts {
class Registry;
}

namespace simcore::dashboard::lap_timer_widget {

struct Config {
  bool enabled{true};
  FontSpec font{};
  Placement placement{};
  std::uint32_t text_color{0xE8E8E8};
};

// Creates the lap timer label and its periodic render callback.
[[nodiscard]] bool create(const Layout& layout, const Config& config,
                          lap_timer::LapTimer& module,
                          const fonts::Registry& fonts);

}  // namespace simcore::dashboard::lap_timer_widget
