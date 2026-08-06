#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"

namespace simcore::configuration {

inline constexpr std::uint16_t kConfigurationSchemaVersion = 2;
inline constexpr std::size_t kMaximumPayloadSize = 4'096;

[[nodiscard]] constexpr bool is_supported_configuration_schema(
    const std::uint16_t version) {
  return version == kConfigurationSchemaVersion;
}

enum class ValidationError : std::uint8_t {
  none,
  malformed,
  unsupported_schema,
  invalid_board,
  board_mismatch,
  invalid_hardware,
  invalid_transport,
  invalid_uart,
  invalid_module,
  invalid_dashboard,
  invalid_widget,
};

[[nodiscard]] ValidationError parse_configuration_json(
    std::span<const std::uint8_t> input,
    const ValidationContext& profile,
    ApplicationConfiguration& configuration);
[[nodiscard]] ValidationError validate_configuration(
    const ApplicationConfiguration& configuration,
    const ValidationContext& profile);
[[nodiscard]] const char* validation_error_name(ValidationError error);

}  // namespace simcore::configuration
