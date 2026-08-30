#pragma once

#include <algorithm>
#include <cstdint>

namespace simcore::dashboard::ring {

struct Centre {
  float radius{};
  float x{};
  float y{};
};

[[nodiscard]] inline Centre resolve(const std::int32_t thickness_px,
                                    const std::int32_t radius_px,
                                    const std::int32_t center_x_px,
                                    const std::int32_t center_y_px,
                                    const std::int32_t inner_width,
                                    const std::int32_t inner_height) {
  const float thickness = static_cast<float>(thickness_px);
  const float fitted =
      static_cast<float>(std::min(inner_width, inner_height)) / 2.0F -
      thickness / 2.0F;
  return Centre{radius_px != 0 ? static_cast<float>(radius_px)
                               : std::max(fitted, 0.0F),
                static_cast<float>(inner_width) / 2.0F +
                    static_cast<float>(center_x_px),
                static_cast<float>(inner_height) / 2.0F +
                    static_cast<float>(center_y_px)};
}

}
