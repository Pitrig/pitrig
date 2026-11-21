#pragma once

#include <cstddef>
#include <cstdint>

#include "track_map.hpp"
#include "track_map_widget.hpp"

namespace pitrig::dashboard::track_map_widget::projection {

struct Fit {
  std::int32_t width{};
  std::int32_t height{};
  float margin{};
  std::uint16_t rotation_deg{};
  bool fit_rotation{};
};

[[nodiscard]] float margin(const Style& style);

void project(const track_map::Outline& outline, const Fit& fit, Projection& projection);

[[nodiscard]] ScreenPoint on_track(const Projection& projection, std::uint32_t fraction);

[[nodiscard]] bool on_pit_lane(const Projection& projection, std::uint32_t fraction,
                               ScreenPoint& point);

[[nodiscard]] std::size_t sector_of(const Projection& projection, std::uint32_t fraction);

}
