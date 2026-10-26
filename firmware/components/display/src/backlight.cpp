#include "backlight.hpp"

#include <algorithm>

#include "driver/ledc.h"
#include "esp_log.h"

namespace pitrig::display {
namespace {

constexpr char kTag[] = "backlight";
constexpr ledc_mode_t kMode = LEDC_LOW_SPEED_MODE;
constexpr ledc_timer_t kTimer = LEDC_TIMER_0;
constexpr ledc_channel_t kChannel = LEDC_CHANNEL_0;
constexpr ledc_timer_bit_t kResolution = LEDC_TIMER_10_BIT;
constexpr std::uint32_t kFullDuty = (1U << 10U) - 1U;
constexpr std::uint32_t kFrequencyHz = 20'000;
constexpr std::uint32_t kMaximumPercent = 100;

[[nodiscard]] std::uint32_t duty_for(const std::uint8_t percent) {
  return kFullDuty * std::min<std::uint32_t>(percent, kMaximumPercent) / kMaximumPercent;
}

}

bool Backlight::attach(const int pin, const std::uint8_t percent) {
  if (pin < 0) {
    return false;
  }
  const ledc_timer_config_t timer{
      .speed_mode = kMode,
      .duty_resolution = kResolution,
      .timer_num = kTimer,
      .freq_hz = kFrequencyHz,
      .clk_cfg = LEDC_AUTO_CLK,
      .deconfigure = false,
  };
  ledc_channel_config_t channel{};
  channel.gpio_num = pin;
  channel.speed_mode = kMode;
  channel.channel = kChannel;
  channel.timer_sel = kTimer;
  channel.duty = duty_for(percent);
  channel.sleep_mode = LEDC_SLEEP_MODE_NO_ALIVE_NO_PD;
  if (ledc_timer_config(&timer) != ESP_OK || ledc_channel_config(&channel) != ESP_OK) {
    ESP_LOGW(kTag, "Backlight on GPIO %d cannot be dimmed", pin);
    return false;
  }
  attached_ = true;
  return true;
}

bool Backlight::set(const std::uint8_t percent) {
  return attached_ && ledc_set_duty(kMode, kChannel, duty_for(percent)) == ESP_OK &&
         ledc_update_duty(kMode, kChannel) == ESP_OK;
}

}
