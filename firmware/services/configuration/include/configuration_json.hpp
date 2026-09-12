#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"

namespace pitrig::configuration {

[[nodiscard]] constexpr bool is_supported_configuration_schema(const std::uint16_t version) {
  return version == kConfigurationSchemaVersion;
}

[[nodiscard]] ValidationFailure parse_configuration_json(ConfigurationDocument document,
                                                         std::span<const std::uint8_t> input,
                                                         const ValidationContext& profile,
                                                         ApplicationConfiguration& configuration);

[[nodiscard]] ValidationFailure validate_configuration(
    const ApplicationConfiguration& configuration, const ValidationContext& profile);

}
