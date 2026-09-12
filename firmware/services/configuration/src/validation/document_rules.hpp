#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"
#include "validation/widget_validator.hpp"

namespace pitrig::configuration::validation {

[[nodiscard]] bool within_family_budget(const ApplicationConfiguration& configuration);

[[nodiscard]] bool validate_transport(const ApplicationConfiguration& configuration,
                                      const ValidationContext& profile, ValidationFailure& failure);

[[nodiscard]] bool validate_references(const DashboardConfiguration& dashboard,
                                       std::span<const WidgetReference> references,
                                       std::size_t count, std::size_t screen_index,
                                       WidgetParentKind parent_kind, std::uint8_t parent_index,
                                       Validator& validator, std::size_t& action_count,
                                       ValidationFailure& failure);

}
