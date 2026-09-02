#include <array>
#include <span>

#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "led_matrix_paint.hpp"
#include "led_paint.hpp"
#include "rgb_frames.hpp"
#include "rgb_leds.hpp"
#include "value_conditions.hpp"

namespace simcore::rgb_leds {
namespace {

void order_by_activation(const std::span<std::uint8_t> order,
                         const EffectState* const states) {
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

}

void RgbLeds::on_telemetry_updated(const events::Event&, void* const context) {
  static_cast<RgbLeds*>(context)->last_telemetry_us_.store(
      static_cast<std::uint64_t>(esp_timer_get_time()));
}

void RgbLeds::task_entry(void* const context) {
  static_cast<RgbLeds*>(context)->run();
}

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

bool RgbLeds::paint_output(const std::size_t output,
                           const std::uint64_t now_us) {
  if (in_flight_[output]) {
    return false;
  }
  const configuration::HardwareDeviceConfiguration& device = *devices_[output];
  const EffectState* const states = states_ + output * kMaximumEffects;
  outputs_[output].clear();
  std::array<std::uint8_t, kMaximumEffects> order{};
  std::uint8_t painting = 0;
  for (std::uint8_t index = 0; index < device.effect_count; ++index) {
    if (gate_holds(output, index,
                   watched_value(bindings_[output * kMaximumEffects + index]),
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
    const LayerColors colors =
        colors_of(effect, watched, state.colors, now_us);
    const std::uint16_t blink_ms =
        colors.blink_ms != 0 ? colors.blink_ms : effect.blink_ms;
    const std::uint64_t blink_since =
        colors.blink_ms != 0 ? colors.since_us : state.started_us;
    if (blink_ms != 0) {
      const std::uint64_t period = static_cast<std::uint64_t>(blink_ms) * 1000;
      if (((now_us - blink_since) / (period / 2)) % 2 == 1) {
        continue;
      }
    }
    const telemetry::TelemetryRead read =
        binding.value.valid() ? reader_->read(binding.value)
                              : telemetry::TelemetryRead{};
    std::optional<double> value;
    if (binding.value.valid()) {
      value = conditions::condition_value(read);
    }
    if (binding.area.width == 0) {
      continue;
    }
    if (colors.background.has_value()) {
      fill_area(outputs_[output], geometry_[output], binding.area,
                *colors.background);
    }
    if (configuration::led_effect_draws_pixels(effect.type)) {
      const Panel panel =
          panel_of(outputs_[output], geometry_[output], binding.area);
      if (effect.type == configuration::LedEffectType::sprite) {
        paint_sprite(panel, binding.sprite, effect, value, colors.tint,
                     now_us - state.started_us);
      } else {
        std::array<char, configuration::kLedTextCapacity + 24> scratch{};
        paint_text(panel, effect, effect_text(effect, read, scratch),
                   colors.ink, now_us - state.started_us);
      }
      continue;
    }
    const Surface surface =
        surface_of(outputs_[output], geometry_[output], binding.area, effect);
    paint(surface, effect, colors.ink, value, now_us - state.started_us);
  }
  if (pushed_[output] && !outputs_[output].changed()) {
    return false;
  }
  if (!outputs_[output].flush({.brightness = device.brightness,
                               .gamma = device.gamma,
                               .current_limit_ma = device.current_limit_ma})) {
    return false;
  }
  outputs_[output].settle();
  pushed_[output] = true;
  return true;
}

std::optional<double> RgbLeds::watched_value(
    const EffectBinding& binding) const {
  return binding.condition.valid()
             ? conditions::condition_value(reader_->read(binding.condition))
             : std::nullopt;
}

bool RgbLeds::gate_holds(const std::size_t output, const std::size_t index,
                         const std::optional<double> watched,
                         const std::uint64_t now_us) {
  const configuration::LedEffect& effect = devices_[output]->effects[index];
  EffectState& state = states_[output * kMaximumEffects + index];
  bool matched = true;

  switch (effect.gate) {
    case configuration::LedGate::always:
      break;
    case configuration::LedGate::telemetry_idle: {
      const std::uint64_t last = last_telemetry_us_.load();
      matched = last == 0 ||
                (now_us > last &&
                 now_us - last > configuration::kLedTelemetryIdleMs * 1000ULL);
      break;
    }
    case configuration::LedGate::conditions: {
      matched = false;
      if (watched.has_value()) {
        for (std::uint8_t rule = 0; rule < effect.condition_count; ++rule) {
          if (conditions::condition_holds(effect.conditions[rule].op, *watched,
                                          effect.conditions[rule].value)) {
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
    state.hold_until_us =
        now_us + static_cast<std::uint64_t>(effect.hold_ms) * 1000;
    return true;
  }
  if (state.holding && now_us < state.hold_until_us) {
    return true;
  }
  state.holding = false;
  return false;
}

}
