#pragma once

#include <cstdint>

#include "application_configuration.hpp"
#include "ring_geometry.hpp"

namespace pitrig::dashboard::ring {

template <typename Config>
[[nodiscard]] Centre resolve_config(const Config& config, const std::int32_t inner_width,
                                    const std::int32_t inner_height) {
  return resolve({.thickness_px = config.thickness_px,
                  .radius_px = config.radius_px,
                  .x_offset_px = config.x_offset_px,
                  .y_offset_px = config.y_offset_px,
                  .center_angle_deg = config.center_angle_deg,
                  .sector_deg = config.sector_deg,
                  .center_on_figure = config.centering == configuration::RingCentering::figure},
                 inner_width, inner_height);
}

}
