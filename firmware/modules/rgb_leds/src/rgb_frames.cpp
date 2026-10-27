#include "rgb_frames.hpp"

#include <array>
#include <span>

#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "led_matrix_paint.hpp"
#include "led_paint.hpp"
#include "rgb_leds.hpp"
#include "value_conditions.hpp"

namespace pitrig::rgb_leds {
namespace {

void order_by_activation(const std::span<std::uint8_t> order, const EffectState* const states) {
  for (std::size_t slot = 1; slot < order.size(); ++slot) {
    const std::uint8_t index = order[slot];
    const std::uint64_t started = states[index].started_us;
    std::size_t place = slot;
    while (place > 0 && states[order[place - 1]].started_us > started) {
      order[place] = order[place - 1];
      --place;
    }
    order[place] = index;
  }
}

[[nodiscard]] bool holds_within(const configuration::ConditionOperator op, const double value,
                                const double threshold, const double margin) {
  switch (op) {
    case configuration::ConditionOperator::above:
      return value > threshold - margin;
    case configuration::ConditionOperator::at_or_above:
      return value >= threshold - margin;
    case configuration::ConditionOperator::below:
      return value < threshold + margin;
    case configuration::ConditionOperator::at_or_below:
      return value <= threshold + margin;
    default:
      return conditions::condition_holds(op, value, threshold);
  }
}

void paint_lamps(led::Output& output, const led::Matrix& matrix, const EffectBinding& binding,
                 const configuration::LedEffect& effect, const LayerColors& colors,
                 const std::optional<double> value, const std::uint64_t elapsed_us) {
  const auto draw = [&](const Surface& surface) {
    if (effect.type == configuration::LedEffectType::sprite) {
      paint_strip_sprite(surface, binding.sprite, effect, value, colors.tint, elapsed_us);
    } else {
      paint(surface, effect, colors.ink, value, elapsed_us);
    }
  };
  const Parts parts = parts_of(effect);
  if (parts.empty()) {
    draw(surface_of(output, matrix, binding.area, effect));
  } else if (effect.layout == configuration::LedPartLayout::each) {
    for (const configuration::LedPart& part : parts) {
      draw(Surface{output, Parts{&part, 1}, effect.inverted, effect.mirrored});
    }
  } else {
    draw(Surface{output, parts, effect.inverted, effect.mirrored});
  }
}

}

void RgbLeds::task_entry(void* const context) { static_cast<RgbLeds*>(context)->run(); }

void RgbLeds::run() {
  (void)esp_task_wdt_add(nullptr);
  const TickType_t period = pdMS_TO_TICKS(kFramePeriodMs);
  TickType_t wake = xTaskGetTickCount();
  while (running_.load()) {
    render(static_cast<std::uint64_t>(esp_timer_get_time()));
    (void)esp_task_wdt_reset();
    if (xTaskDelayUntil(&wake, period) == pdFALSE) {
      vTaskDelay(1);
      wake = xTaskGetTickCount();
    }
  }
  (void)esp_task_wdt_delete(nullptr);
  finished_.store(true);
  vTaskDelete(nullptr);
}

void RgbLeds::render(const std::uint64_t now_us) {
  for (std::size_t index = 0; index < output_count_; ++index) {
    if (paint_output(index, now_us)) {
      in_flight_[index] = true;
    }
  }
  for (std::size_t index = 0; index < output_count_; ++index) {
    if (in_flight_[index]) {
      in_flight_[index] = !outputs_[index].finish(led::kTransmitTimeoutMs);
    }
  }
}

bool RgbLeds::paint_output(const std::size_t output, const std::uint64_t now_us) {
  if (in_flight_[output]) {
    return false;
  }
  const configuration::HardwareDeviceConfiguration& device = *devices_[output];
  const EffectState* const states = states_ + output * kMaximumEffects;
  outputs_[output].clear();
  std::array<std::uint8_t, kMaximumEffects> order{};
  std::uint8_t painting = 0;
  for (std::uint8_t index = 0; index < device.effect_count; ++index) {
    if (gate_holds(output, index, watched_value(bindings_[output * kMaximumEffects + index]),
                   now_us)) {
      order[painting++] = index;
    }
  }
  order_by_activation({order.data(), painting}, states);
  for (std::uint8_t slot = 0; slot < painting; ++slot) {
    const std::uint8_t index = order[slot];
    const EffectBinding& binding = bindings_[output * kMaximumEffects + index];
    const std::optional<double> watched = watched_value(binding);
    const configuration::LedEffect& effect = device.effects[index];
    EffectState& state = states_[output * kMaximumEffects + index];
    const LayerColors colors = colors_of(effect, watched, state.colors, now_us);
    if (binding.area.width == 0) {
      continue;
    }
    if (colors.background.has_value()) {
      if (effect.part_count == 0) {
        fill_area(outputs_[output], geometry_[output], binding.area, *colors.background);
      } else {
        fill_parts(outputs_[output], parts_of(effect), *colors.background);
      }
    }
    const std::uint16_t blink_ms = colors.blink_ms != 0 ? colors.blink_ms : effect.blink_ms;
    const std::uint64_t blink_since = colors.blink_ms != 0 ? colors.since_us : state.started_us;
    if (blink_ms != 0) {
      const std::uint64_t period = static_cast<std::uint64_t>(blink_ms) * 1000;
      if (((now_us - blink_since) / (period / 2)) % 2 == 1) {
        continue;
      }
    }
    const telemetry::TelemetryRead read =
        binding.value.valid() ? reader_->read(binding.value) : telemetry::TelemetryRead{};
    std::optional<double> value;
    if (binding.value.valid()) {
      value = conditions::condition_value(read);
    }
    const std::uint64_t elapsed_us = now_us - state.started_us;
    if (device.type == configuration::HardwareDeviceType::rgb_matrix &&
        configuration::led_effect_draws_pixels(effect.type)) {
      const Panel panel = panel_of(outputs_[output], geometry_[output], binding.area);
      if (effect.type == configuration::LedEffectType::sprite) {
        paint_sprite(panel, binding.sprite, effect, value, colors.tint, elapsed_us);
      } else {
        std::array<char, configuration::kLedTextCapacity + 24> scratch{};
        paint_text(panel, effect, effect_text(effect, read, scratch), colors.ink, elapsed_us);
      }
      continue;
    }
    paint_lamps(outputs_[output], geometry_[output], binding, effect, colors, value, elapsed_us);
  }
  const std::uint8_t brightness = output_brightness(device.brightness);
  if (outputs_[output].changed() || brightness != flushed_brightness_[output]) {
    quiet_frames_[output] = 0;
  } else if (quiet_frames_[output] > kDitherTailFrames) {
    return false;
  }
  flushed_brightness_[output] = brightness;
  if (!outputs_[output].flush({.brightness = brightness,
                               .gamma = device.gamma,
                               .current_limit_ma = device.current_limit_ma,
                               .dither = quiet_frames_[output] < kDitherTailFrames})) {
    return false;
  }
  outputs_[output].settle();
  ++quiet_frames_[output];
  return true;
}

std::uint8_t RgbLeds::output_brightness(const std::uint8_t configured) const {
  if (!lit_.load()) {
    return 0;
  }
  return static_cast<std::uint8_t>(static_cast<std::uint32_t>(configured) * scale_percent_.load() /
                                   100U);
}

std::optional<double> RgbLeds::watched_value(const EffectBinding& binding) const {
  return binding.condition.valid() ? conditions::condition_value(reader_->read(binding.condition))
                                   : std::nullopt;
}

bool RgbLeds::gate_holds(const std::size_t output, const std::size_t index,
                         const std::optional<double> watched, const std::uint64_t now_us) {
  const configuration::LedEffect& effect = devices_[output]->effects[index];
  EffectState& state = states_[output * kMaximumEffects + index];
  bool matched = true;

  switch (effect.gate) {
    case configuration::LedGate::always:
      break;
    case configuration::LedGate::telemetry_idle: {
      const auto last = static_cast<std::uint64_t>(reader_->last_arrival_us());
      matched = last == 0 ||
                (now_us > last && now_us - last > configuration::kLedTelemetryIdleMs * 1000ULL);
      break;
    }
    case configuration::LedGate::conditions: {
      matched = false;
      if (watched.has_value()) {
        const double margin = state.holding ? effect.hysteresis : 0.0;
        for (std::uint8_t rule = 0; rule < effect.condition_count; ++rule) {
          if (holds_within(effect.conditions[rule].op, *watched, effect.conditions[rule].value,
                           margin)) {
            matched = true;
            break;
          }
        }
      }
      break;
    }
  }

  if (matched) {
    if (!state.holding) {
      state.holding = true;
      state.started_us = now_us;
    }
    state.hold_until_us = now_us + static_cast<std::uint64_t>(effect.hold_ms) * 1000;
    return true;
  }
  if (state.holding && now_us < state.hold_until_us) {
    return true;
  }
  state.holding = false;
  return false;
}

}
