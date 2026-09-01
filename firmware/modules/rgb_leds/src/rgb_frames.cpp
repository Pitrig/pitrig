#include <array>

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
  outputs_[output].clear();
  for (std::uint8_t index = 0; index < device.effect_count; ++index) {
    if (!gate_holds(output, index, now_us)) {
      continue;
    }
    const configuration::LedEffect& effect = device.effects[index];
    const EffectState& state = states_[output * kMaximumEffects + index];
    if (effect.blink_ms != 0) {
      const std::uint64_t period = static_cast<std::uint64_t>(effect.blink_ms) * 1000;
      if (((now_us - state.started_us) / (period / 2)) % 2 == 1) {
        continue;
      }
    }
    const EffectBinding& binding = bindings_[output * kMaximumEffects + index];
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
    if (configuration::led_effect_draws_pixels(effect.type)) {
      const Panel panel =
          panel_of(outputs_[output], geometry_[output], binding.area);
      if (effect.type == configuration::LedEffectType::sprite) {
        paint_sprite(panel, binding.sprite, effect, value,
                     now_us - state.started_us);
      } else {
        std::array<char, configuration::kLedTextCapacity + 24> scratch{};
        paint_text(panel, effect, effect_text(effect, read, scratch),
                   now_us - state.started_us);
      }
      continue;
    }
    const Surface surface =
        surface_of(outputs_[output], geometry_[output], binding.area, effect);
    paint(surface, effect, value, now_us - state.started_us);
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

bool RgbLeds::gate_holds(const std::size_t output, const std::size_t index,
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
      const std::optional<double> value = conditions::condition_value(
          reader_->read(bindings_[output * kMaximumEffects + index].condition));
      if (value.has_value()) {
        for (std::uint8_t rule = 0; rule < effect.condition_count; ++rule) {
          if (conditions::condition_holds(effect.conditions[rule].op, *value,
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
