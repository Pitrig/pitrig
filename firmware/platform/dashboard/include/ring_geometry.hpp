#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <numbers>

namespace pitrig::dashboard::ring {

struct Centre {
  float radius{};
  float x{};
  float y{};
};

struct Geometry {
  std::int32_t thickness_px{};
  std::int32_t radius_px{};
  std::int32_t x_offset_px{};
  std::int32_t y_offset_px{};
  std::int32_t center_angle_deg{};
  std::int32_t sector_deg{};
  bool center_on_figure{};
};

[[nodiscard]] inline float sector_start(const std::int32_t center_angle_deg,
                                        const float sector_deg) {
  const float start = static_cast<float>(center_angle_deg) - sector_deg / 2.0F;
  return start < 0.0F ? start + 360.0F : start;
}

namespace figure {

struct Offset {
  float x{};
  float y{};
};

struct Bounds {
  float min_x{std::numeric_limits<float>::max()};
  float max_x{std::numeric_limits<float>::lowest()};
  float min_y{std::numeric_limits<float>::max()};
  float max_y{std::numeric_limits<float>::lowest()};
};

inline void extend(Bounds& bounds, const float radius, const float degrees) {
  const float radians = degrees * std::numbers::pi_v<float> / 180.0F;
  const float x = radius * std::cos(radians);
  const float y = radius * std::sin(radians);
  bounds.min_x = std::min(bounds.min_x, x);
  bounds.max_x = std::max(bounds.max_x, x);
  bounds.min_y = std::min(bounds.min_y, y);
  bounds.max_y = std::max(bounds.max_y, y);
}

[[nodiscard]] inline bool inside_sector(const float start_deg,
                                        const float sector_deg,
                                        const float degrees) {
  float travelled = std::fmod(degrees - start_deg, 360.0F);
  if (travelled < 0.0F) {
    travelled += 360.0F;
  }
  return travelled <= sector_deg;
}

[[nodiscard]] inline Offset centre_offset(const float start_deg,
                                          const float sector_deg,
                                          const float radius,
                                          const float thickness) {
  const float outer = radius + thickness / 2.0F;
  const float inner = std::max(radius - thickness / 2.0F, 0.0F);
  Bounds bounds{};
  for (const float degrees : {start_deg, start_deg + sector_deg}) {
    extend(bounds, outer, degrees);
    extend(bounds, inner, degrees);
  }
  for (std::int32_t quarter = 0; quarter < 4; ++quarter) {
    const auto degrees = static_cast<float>(90 * quarter);
    if (inside_sector(start_deg, sector_deg, degrees)) {
      extend(bounds, outer, degrees);
    }
  }
  return Offset{(bounds.min_x + bounds.max_x) / 2.0F,
                (bounds.min_y + bounds.max_y) / 2.0F};
}

}

[[nodiscard]] inline Centre resolve(const Geometry& geometry,
                                    const std::int32_t inner_width,
                                    const std::int32_t inner_height) {
  const auto thickness = static_cast<float>(geometry.thickness_px);
  const float fitted =
      static_cast<float>(std::min(inner_width, inner_height)) / 2.0F -
      thickness / 2.0F;
  const float radius = geometry.radius_px != 0
                           ? static_cast<float>(geometry.radius_px)
                           : std::max(fitted, 0.0F);
  float x = static_cast<float>(inner_width) / 2.0F +
            static_cast<float>(geometry.x_offset_px);
  float y = static_cast<float>(inner_height) / 2.0F +
            static_cast<float>(geometry.y_offset_px);
  if (geometry.center_on_figure) {
    const auto sector = static_cast<float>(geometry.sector_deg);
    const figure::Offset offset = figure::centre_offset(
        sector_start(geometry.center_angle_deg, sector), sector, radius,
        thickness);
    x -= offset.x;
    y -= offset.y;
  }
  return Centre{radius, x, y};
}

}
