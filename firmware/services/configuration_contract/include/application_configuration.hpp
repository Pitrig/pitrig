#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

#include "application_configuration_generated.hpp"

namespace pitrig::configuration {

template <std::size_t Capacity>
[[nodiscard]] constexpr std::string_view text_view(
    const std::array<char, Capacity>& text) {
  std::size_t length{};
  while (length < text.size() && text[length] != '\0') {
    ++length;
  }
  return {text.data(), length};
}

[[nodiscard]] constexpr std::string_view value_binding_view(
    const std::array<char, kValueBindingCapacity>& binding) {
  return text_view(binding);
}

[[nodiscard]] constexpr int led_palette_digit(const char digit) {
  if (digit >= '0' && digit <= '9') {
    return digit - '0';
  }
  if (digit >= 'a' && digit <= 'f') {
    return digit - 'a' + 10;
  }
  if (digit >= 'A' && digit <= 'F') {
    return digit - 'A' + 10;
  }
  return -1;
}

[[nodiscard]] constexpr std::size_t led_device_lamps(
    const HardwareDeviceConfiguration& device) {
  return device.type == HardwareDeviceType::rgb_strip
             ? device.count
             : static_cast<std::size_t>(device.width) * device.height;
}

[[nodiscard]] constexpr bool led_effect_reads_value(const LedEffectType type) {
  return type == LedEffectType::steps || type == LedEffectType::gauge ||
         type == LedEffectType::sprite || type == LedEffectType::text;
}

[[nodiscard]] constexpr bool led_effect_draws_pixels(const LedEffectType type) {
  return type == LedEffectType::sprite || type == LedEffectType::text;
}

template <typename Predicate>
[[nodiscard]] bool any_widget_frame(const DashboardConfiguration& dashboard,
                                    Predicate&& matches) {
  for (const WidgetTypeTraits& traits : kWidgetTypeTraits) {
    const std::uint8_t count = traits.count(dashboard);
    for (std::uint8_t index = 0; index < count; ++index) {
      const WidgetFrame* const frame = traits.frame(dashboard, index);
      if (frame != nullptr && matches(*frame)) {
        return true;
      }
    }
  }
  return false;
}

template <typename Visitor>
void for_each_widget_frame(const DashboardConfiguration& dashboard,
                           Visitor&& visit) {
  (void)any_widget_frame(dashboard, [&visit](const WidgetFrame& frame) {
    visit(frame);
    return false;
  });
}

struct DisplayValidationProfile {
  std::int32_t width{};
  std::int32_t height{};
};

inline constexpr std::size_t kMaximumBoardLedPins = 32;

struct LedValidationProfile {
  std::array<std::int8_t, kMaximumBoardLedPins> pins{};
  std::uint8_t pin_count{};
  std::uint8_t max_outputs{kMaximumHardwareDevices};

  [[nodiscard]] constexpr bool offers(const int pin) const {
    if (pin < 0) {
      return false;
    }
    for (std::uint8_t index = 0; index < pin_count; ++index) {
      if (pins[index] == static_cast<std::int8_t>(pin)) {
        return true;
      }
    }
    return false;
  }
};

struct ValidationContext {
  BoardId board{BoardId::t_display_s3};
  DisplayValidationProfile display{};
  LedValidationProfile led{};
  int uart_tx_pin{};
  int uart_rx_pin{};
  bool uart_supported{};
  bool native_usb_cdc_supported{};
};

}
