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
