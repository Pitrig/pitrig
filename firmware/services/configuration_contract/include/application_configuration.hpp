#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

#include "application_configuration_generated.hpp"

namespace simcore::configuration {

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

struct ValidationContext {
  BoardId board{BoardId::t_display_s3};
  DisplayValidationProfile display{};
  int uart_tx_pin{};
  int uart_rx_pin{};
  bool uart_supported{};
  bool native_usb_cdc_supported{};
};

}
