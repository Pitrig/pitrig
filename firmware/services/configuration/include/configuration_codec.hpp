#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"

namespace simcore::configuration {

inline constexpr std::uint16_t kOldestConfigurationSchemaVersion = 1;
inline constexpr std::uint16_t kConfigurationSchemaVersion = 3;
inline constexpr std::size_t kMaximumPayloadSize = 512;

[[nodiscard]] constexpr bool is_supported_configuration_schema(
    const std::uint16_t version) {
  return version >= kOldestConfigurationSchemaVersion &&
         version <= kConfigurationSchemaVersion;
}

enum class ValidationError : std::uint8_t {
  none,
  malformed,
  unsupported_schema,
  invalid_board,
  board_mismatch,
  invalid_transport,
  invalid_uart,
  invalid_module,
  invalid_dashboard,
  invalid_region,
  invalid_widget,
};

struct CodecResult {
  bool ok{};
  ValidationError error{ValidationError::none};
  std::size_t size{};
};

[[nodiscard]] CodecResult encode_configuration(
    const ApplicationConfiguration& configuration,
    std::span<std::uint8_t> output);
[[nodiscard]] CodecResult decode_configuration(
    std::span<const std::uint8_t> input,
    ApplicationConfiguration& configuration);
[[nodiscard]] ValidationError validate_configuration(
    const ApplicationConfiguration& configuration);
[[nodiscard]] const char* validation_error_name(ValidationError error);

}  // namespace simcore::configuration
