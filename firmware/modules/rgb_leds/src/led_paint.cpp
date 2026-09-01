#include "led_paint.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "value_conditions.hpp"

namespace simcore::rgb_leds {
namespace {

using configuration::LedEffect;

[[nodiscard]] led::Color ramp_at(const LedEffect& effect, const float position,
                                 const led::Color fallback) {
  const std::optional<std::uint32_t> color = conditions::ramp_color(
      {effect.stops.data(), effect.stop_count}, static_cast<double>(position));
  return color.has_value() ? led::Color::from_rgb(*color) : fallback;
}

void paint_solid(const Surface& surface, const LedEffect& effect) {
  const led::Color color = led::Color::from_rgb(effect.color);
  for (std::size_t index = 0; index < surface.size(); ++index) {
    surface.set(index, color);
  }
}

void paint_gradient(const Surface& surface, const LedEffect& effect) {
  const led::Color fallback = led::Color::from_rgb(effect.color);
  const std::size_t lamps = surface.size();
  for (std::size_t index = 0; index < lamps; ++index) {
    const float position =
        lamps <= 1 ? 0.0F : static_cast<float>(index) / (lamps - 1);
    surface.set(index, ramp_at(effect, position, fallback));
  }
}

void paint_steps(const Surface& surface, const LedEffect& effect,
                 const float fraction) {
  const std::size_t lamps = surface.size();
  if (effect.step_count == 0 || lamps == 0) {
    return;
  }
  for (std::size_t index = 0; index < lamps; ++index) {
    const std::size_t step = std::min<std::size_t>(
        index * effect.step_count / lamps, effect.step_count - 1U);
    if (fraction + 1e-6F < effect.steps[step].threshold) {
      continue;
    }
    surface.set(index, led::Color::from_rgb(effect.steps[step].color));
  }
}

void paint_gauge(const Surface& surface, const LedEffect& effect,
                 const float fraction, const float value) {
  const led::Color fallback = led::Color::from_rgb(effect.color);
  const led::Color color =
      effect.stop_count >= 2 ? ramp_at(effect, value, fallback) : fallback;
  const std::size_t lamps = surface.size();
  const auto lit =
      static_cast<std::size_t>(std::lround(fraction * lamps));
  for (std::size_t index = 0; index < lit && index < lamps; ++index) {
    surface.set(index, color);
  }
}

[[nodiscard]] led::Color wheel(const float turn) {
  const float hue = (turn - std::floor(turn)) * 6.0F;
  const auto sector = static_cast<int>(hue);
  const auto rise = static_cast<std::uint8_t>((hue - sector) * 255.0F);
  const auto fall = static_cast<std::uint8_t>(255 - rise);
  switch (sector) {
    case 0:
      return {255, rise, 0};
    case 1:
      return {fall, 255, 0};
    case 2:
      return {0, 255, rise};
    case 3:
      return {0, fall, 255};
    case 4:
      return {rise, 0, 255};
    default:
      return {255, 0, fall};
  }
}

void paint_animation(const Surface& surface, const LedEffect& effect,
                     const float phase) {
  const led::Color color = led::Color::from_rgb(effect.color);
  const std::size_t lamps = surface.size();
  if (lamps == 0) {
    return;
  }
  const float head = phase * lamps;
  const float sweep = 1.0F - std::abs(2.0F * phase - 1.0F);
  const float breath =
      0.5F - 0.5F * std::cos(phase * 2.0F * std::numbers::pi_v<float>);
  for (std::size_t index = 0; index < lamps; ++index) {
    const float position = static_cast<float>(index) / lamps;
    switch (effect.animation) {
      case configuration::LedAnimationKind::rainbow:
        surface.set(index, wheel(phase + position));
        break;
      case configuration::LedAnimationKind::pulse:
        surface.set(index, color.faded(breath));
        break;
      case configuration::LedAnimationKind::wipe:
        if (static_cast<float>(index) < head) {
          surface.set(index, color);
        }
        break;
      case configuration::LedAnimationKind::chase:
        if (static_cast<std::size_t>(head) % lamps == index) {
          surface.set(index, color);
        }
        break;
      case configuration::LedAnimationKind::scan: {
        const float distance =
            std::abs(static_cast<float>(index) - sweep * (lamps - 1));
        surface.set(index, color.faded(1.0F - distance));
        break;
      }
    }
  }
}

}

void Surface::put(const std::size_t offset, const led::Color color) const {
  if (area_.width == 0) {
    return;
  }
  const auto column = static_cast<std::uint16_t>(offset % area_.width);
  const auto row = static_cast<std::uint16_t>(offset / area_.width);
  if (!area_.holds(column, row)) {
    return;
  }
  const std::size_t lamp =
      led::matrix_lamp(*matrix_, area_.x + column, area_.y + row);
  if (lamp != static_cast<std::size_t>(-1)) {
    output_->set(lamp, color);
  }
}

void Surface::set(const std::size_t index, const led::Color color) const {
  if (index >= size()) {
    return;
  }
  if (!mirrored_) {
    put(inverted_ ? count_ - 1 - index : index, color);
    return;
  }
  const std::size_t half = size();
  put(inverted_ ? index : half - 1 - index, color);
  put(inverted_ ? count_ - 1 - index : count_ - half + index, color);
}

bool Area::holds(const std::uint16_t column, const std::uint16_t row) const {
  if (mask.empty()) {
    return true;
  }
  const std::size_t pixel =
      static_cast<std::size_t>(y + row) * stride + (x + column);
  const std::size_t digit = pixel / 4;
  if (digit >= mask.size()) {
    return false;
  }
  const int value = configuration::led_palette_digit(mask[digit]);
  return value >= 0 && (value & (1 << (3 - pixel % 4))) != 0;
}

Area area_of(const led::Matrix& matrix,
             const configuration::LedEffect& effect) {
  const std::uint16_t across = matrix.drawn_width();
  const std::uint16_t down = matrix.drawn_height();
  if (across == 0 || down == 0) {
    return {};
  }
  if (down == 1) {
    if (effect.from >= across) {
      return {};
    }
    const auto available = static_cast<std::uint16_t>(across - effect.from);
    const std::uint16_t count =
        effect.count == 0 ? available : std::min(effect.count, available);
    return count == 0 ? Area{} : Area{effect.from, 0, count, 1, {}, across};
  }
  const std::string_view mask = configuration::text_view(effect.panel_mask);
  if (mask.empty()) {
    return Area{0, 0, across, down, {}, across};
  }
  Area whole{0, 0, across, down, mask, across};
  std::uint16_t left = across;
  std::uint16_t top = down;
  std::uint16_t right = 0;
  std::uint16_t bottom = 0;
  for (std::uint16_t row = 0; row < down; ++row) {
    for (std::uint16_t column = 0; column < across; ++column) {
      if (!whole.holds(column, row)) {
        continue;
      }
      left = std::min(left, column);
      top = std::min(top, row);
      right = std::max(right, column);
      bottom = std::max(bottom, row);
    }
  }
  if (left > right || top > bottom) {
    return {};
  }
  return Area{left, top, static_cast<std::uint16_t>(right - left + 1),
              static_cast<std::uint16_t>(bottom - top + 1), mask, across};
}

Surface surface_of(led::Output& output, const led::Matrix& matrix,
                   const Area& area, const configuration::LedEffect& effect) {
  return Surface{output, matrix, area, effect.inverted, effect.mirrored};
}

void paint(const Surface& surface, const configuration::LedEffect& effect,
           const std::optional<double> value, const std::uint64_t elapsed_us) {
  const float fraction =
      value.has_value() ? conditions::range_fraction(*value, effect.range)
                        : 0.0F;
  const std::uint64_t period_us =
      static_cast<std::uint64_t>(effect.speed_ms == 0 ? 1000
                                                      : effect.speed_ms) *
      1000;
  const float phase = static_cast<float>(elapsed_us % period_us) /
                      static_cast<float>(period_us);

  switch (effect.type) {
    case configuration::LedEffectType::solid:
      paint_solid(surface, effect);
      break;
    case configuration::LedEffectType::gradient:
      paint_gradient(surface, effect);
      break;
    case configuration::LedEffectType::steps:
      paint_steps(surface, effect, fraction);
      break;
    case configuration::LedEffectType::gauge:
      paint_gauge(surface, effect, fraction,
                  static_cast<float>(value.value_or(0.0)));
      break;
    case configuration::LedEffectType::animation:
      paint_animation(surface, effect, phase);
      break;
    case configuration::LedEffectType::sprite:
    case configuration::LedEffectType::text:
      break;
  }
}

}
