#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"
#include "validation/widget_validator.hpp"

// Document-level rules that span more than one widget: the family budget an
// uploaded package bounds, the transport profile the board supports, and the
// reference tables that tie every pool slot to exactly one parent. Called from
// validate_configuration, which owns the walk order.
namespace simcore::configuration::validation {

// An uploaded package carries one face per family, so a document may not name
// more families than a package can hold. Sizes are free: every one of them is
// rasterized from the same face.
[[nodiscard]] bool within_family_budget(
    const ApplicationConfiguration& configuration);

[[nodiscard]] bool validate_transport(
    const ApplicationConfiguration& configuration,
    const ValidationContext& profile, ValidationFailure& failure);

// One ordered reference table, whether it belongs to a screen, a container
// shape or one page of a slot. Each entry must name a filled pool slot whose
// widget agrees about the parent that declared it, so a document cannot point
// two parents at one widget or leave a widget claiming a parent that never
// referenced it.
[[nodiscard]] bool validate_references(
    const DashboardConfiguration& dashboard,
    std::span<const WidgetReference> references, std::size_t count,
    std::size_t screen_index, WidgetParentKind parent_kind,
    std::uint8_t parent_index, Validator& validator, std::size_t& action_count,
    ValidationFailure& failure);

}  // namespace simcore::configuration::validation
