#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"

namespace pitrig::configuration {

[[nodiscard]] constexpr bool is_supported_configuration_schema(const std::uint16_t version) {
  return version == kConfigurationSchemaVersion;
}

struct ValidationScratch {
  static constexpr std::size_t kPageTableSize = kMaximumSlotWidgets * kMaximumSlotPages;

  std::array<std::int64_t, kPageTableSize> page_origin_x{};
  std::array<std::int64_t, kPageTableSize> page_origin_y{};
  std::array<std::int64_t, kMaximumShapeWidgets> origin_x{};
  std::array<std::int64_t, kMaximumShapeWidgets> origin_y{};
};

[[nodiscard]] ValidationFailure parse_configuration_json(ConfigurationDocument document,
                                                         std::span<const std::uint8_t> input,
                                                         const ValidationContext& profile,
                                                         ApplicationConfiguration& configuration,
                                                         ValidationScratch& scratch);

[[nodiscard]] ValidationFailure validate_configuration(
    const ApplicationConfiguration& configuration, const ValidationContext& profile,
    ValidationScratch& scratch);

}
