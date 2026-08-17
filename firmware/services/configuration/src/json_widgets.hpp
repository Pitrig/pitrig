#pragma once

#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"
#include "cJSON.h"

namespace simcore::configuration::json {

// Where a parsed widget's reference is recorded. A screen and a container shape
// keep the same ordered table into the dashboard-wide pool and differ only in
// capacity, so the parser takes the table rather than the owner.
struct ReferenceTable {
  std::span<WidgetReference> entries;
  std::uint8_t* count;
};

// Parses one element of the heterogeneous widget array into the typed storage
// for its variant and records its authored position.
//
// Widgets are authored inside a screen or a container shape but stored in the
// dashboard-wide pool, so this writes the configuration into the pool and leaves
// the owner holding a reference to that slot. `parent_present` says which owner
// it was, which decides the widget's LVGL parent and therefore whether its
// geometry is absolute.
//
// A shape may itself hold widgets, so this recurses. `depth` counts a widget on
// a screen as 0 and bounds that recursion — the configuration task's stack is
// what the bound is really about.
[[nodiscard]] bool parse_widget(const cJSON* object,
                                DashboardConfiguration& dashboard,
                                const ReferenceTable& owner,
                                std::uint8_t screen_index,
                                std::uint8_t parent_index, bool parent_present,
                                std::uint8_t depth, ValidationFailure& failure);

}  // namespace simcore::configuration::json
