#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"

namespace simcore::configuration {

[[nodiscard]] constexpr bool is_supported_configuration_schema(
    const std::uint16_t version) {
  return version == kConfigurationSchemaVersion;
}

// Parses a sparse schema document into bounded runtime storage and validates it
// against immutable hardware. On rejection the failure carries the offending
// widget index and property path so the configurator can point at the cause.
[[nodiscard]] ValidationFailure parse_configuration_json(
    std::span<const std::uint8_t> input,
    const ValidationContext& profile,
    ApplicationConfiguration& configuration);

[[nodiscard]] ValidationFailure validate_configuration(
    const ApplicationConfiguration& configuration,
    const ValidationContext& profile);

}  // namespace simcore::configuration
