#include "led_paint.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "value_conditions.hpp"

namespace pitrig::rgb_leds {
namespace {

using configuration::LedEffect;

[[nodiscard]] led::Color ramp_at(const LedEffect& effect, const float position,
                                 const led::Color fallback) {
  const std::optional<std::uint32_t> color = conditions::ramp_color(
      {effect.stops.data(), effect.stop_count}, static_cast<double>(position));
  return color.has_value() ? led::Color::from_rgb(*color) : fallback;
}

void paint_solid(const Surface& surface, const led::Color color) {
  for (std::size_t index = 0; index < surface.size(); ++index) {
    surface.set(index, color);
  }
}

void paint_gradient(const Surface& surface, const LedEffect& effect,
                    const led::Color fallback) {
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
                 const led::Color fallback, const float fraction,
                 const float value) {
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
                     const led::Color color, const float phase) {
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

[[nodiscard]] int matching_rule(const LedEffect& effect,
                               const std::optional<double> watched) {
  if (!watched.has_value()) {
    return -1;
  }
  for (std::uint8_t index = 0; index < effect.color_rule_count; ++index) {
    const configuration::LedColorRule& rule = effect.color_rules[index];
    if (conditions::condition_holds(rule.op, *watched, rule.value)) {
      return index;
    }
  }
  return -1;
}

[[nodiscard]] int applied_rule(const LedEffect& effect,
                               const std::optional<double> watched,
                               ColorRuleState& state,
                               const std::uint64_t now_us) {
  int applied = matching_rule(effect, watched);
  if (applied >= 0) {
    state.hold_until_us =
        now_us +
        static_cast<std::uint64_t>(effect.color_rules[applied].hold_ms) * 1000;
  } else if (state.applied >= 0 && state.applied < effect.color_rule_count &&
             now_us < state.hold_until_us) {
    applied = state.applied;
  }
  if (applied != state.applied) {
    state.applied = applied;
    state.started_us = now_us;
  }
  return applied;
}

}

LayerColors colors_of(const configuration::LedEffect& effect,
                      const std::optional<double> watched,
                      ColorRuleState& state, const std::uint64_t now_us) {
  LayerColors colors{.ink = led::Color::from_rgb(effect.color)};
  if (effect.background_color != configuration::kTransparentColor) {
    colors.background = led::Color::from_rgb(effect.background_color);
  }
  const int applied = applied_rule(effect, watched, state, now_us);
  if (applied < 0) {
    return colors;
  }
  const configuration::LedColorRule& rule = effect.color_rules[applied];
  if (rule.color != configuration::kTransparentColor) {
    colors.tint = led::Color::from_rgb(rule.color);
    colors.ink = *colors.tint;
  }
  if (rule.background_color != configuration::kTransparentColor) {
    colors.background = led::Color::from_rgb(rule.background_color);
  }
  colors.blink_ms = rule.blink_ms;
  colors.since_us = state.started_us;
  return colors;
}

void paint(const Surface& surface, const configuration::LedEffect& effect,
           const led::Color color, const std::optional<double> value,
           const std::uint64_t elapsed_us) {
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
      paint_solid(surface, color);
      break;
    case configuration::LedEffectType::gradient:
      paint_gradient(surface, effect, color);
      break;
    case configuration::LedEffectType::steps:
      paint_steps(surface, effect, fraction);
      break;
    case configuration::LedEffectType::gauge:
      paint_gauge(surface, effect, color, fraction,
                  static_cast<float>(value.value_or(0.0)));
      break;
    case configuration::LedEffectType::animation:
      paint_animation(surface, effect, color, phase);
      break;
    case configuration::LedEffectType::sprite:
    case configuration::LedEffectType::text:
      break;
  }
}

}
