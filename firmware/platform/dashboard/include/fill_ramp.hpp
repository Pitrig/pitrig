#pragma once

#include <algorithm>
#include <cstdint>

#include "application_configuration.hpp"
#include "value_conditions.hpp"

namespace pitrig::dashboard::fill {

struct Ramp {
  std::uint32_t from{};
  std::uint32_t via{};
  std::uint32_t to{};
  bool has_via{};
};

[[nodiscard]] inline Ramp ramp(const std::uint32_t fill_color,
                               const std::uint32_t mid_color,
                               const std::uint32_t grad_color) {
  return Ramp{fill_color, mid_color, grad_color,
              mid_color != configuration::kTransparentColor};
}

[[nodiscard]] inline std::uint32_t color_at(const Ramp& ramp,
                                            const float fraction) {
  const float clamped = std::clamp(fraction, 0.0F, 1.0F);
  if (!ramp.has_via) {
    return conditions::blend_color(ramp.from, ramp.to, clamped);
  }
  return clamped <= 0.5F
             ? conditions::blend_color(ramp.from, ramp.via, clamped * 2.0F)
             : conditions::blend_color(ramp.via, ramp.to,
                                       (clamped - 0.5F) * 2.0F);
}

}
