#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

#include "application_configuration_generated.hpp"

// Public schema value contract. Structures, bounded capacities, enumerations,
// and their wire spellings are generated from configuration/configuration_schema.json
// by tools/generate_configuration_schema.py. This header adds only what is logic
// rather than shape: helpers over the generated storage, and the private
// firmware metadata that validates a public configuration against immutable
// hardware.

namespace simcore::configuration {

using ValueBinding = std::array<char, kValueBindingCapacity>;

[[nodiscard]] constexpr ValueBinding make_value_binding(
    const std::string_view name) {
  ValueBinding result{};
  if (name.size() >= result.size()) {
    return result;
  }
  for (std::size_t index = 0; index < name.size(); ++index) {
    result[index] = name[index];
  }
  return result;
}

[[nodiscard]] inline std::string_view value_binding_view(
    const ValueBinding& binding) {
  std::size_t length{};
  while (length < binding.size() && binding[length] != '\0') {
    ++length;
  }
  return {binding.data(), length};
}

template <std::size_t Capacity>
[[nodiscard]] constexpr std::string_view text_view(
    const std::array<char, Capacity>& text) {
  std::size_t length{};
  while (length < text.size() && text[length] != '\0') {
    ++length;
  }
  return {text.data(), length};
}

struct DisplayValidationProfile {
  std::int32_t width{};
  std::int32_t height{};
};

// Private firmware metadata used to validate a public configuration against
// immutable hardware. It is not serialized or exposed by the control protocol.
struct ValidationContext {
  BoardId board{BoardId::t_display_s3};
  DisplayValidationProfile display{};
  int uart_tx_pin{};
  int uart_rx_pin{};
  bool uart_supported{};
  bool native_usb_cdc_supported{};
};

}  // namespace simcore::configuration
