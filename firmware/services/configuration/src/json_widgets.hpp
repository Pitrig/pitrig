#pragma once

#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"
#include "cJSON.h"

namespace simcore::configuration::json {

// Where a parsed widget's reference is recorded. A screen, a container shape and
// one page of a slot keep the same ordered table into the dashboard-wide pool
// and differ only in capacity, so the parser takes the table rather than the
// owner.
struct ReferenceTable {
  std::span<WidgetReference> entries;
  std::uint8_t* count;
};

// Which object owns the coordinate space a widget is authored in, and its index
// in whichever table that kind addresses. Passed as a pair so the two can never
// be supplied out of step; `screen` ignores the index.
struct ParentRef {
  WidgetParentKind kind{WidgetParentKind::screen};
  std::uint8_t index{};
};

// Parses one element of the heterogeneous widget array into the typed storage
// for its variant and records its authored position.
//
// Widgets are authored inside a screen, a container shape or a slot page but
// stored in the dashboard-wide pool, so this writes the configuration into the
// pool and leaves the owner holding a reference to that pool entry. `parent`
// says which owner it was, which decides the widget's LVGL parent and therefore
// whether its geometry is absolute.
//
// A shape and a slot page may themselves hold widgets, so this recurses.
// `depth` counts a widget on a screen as 0 and bounds that recursion — the
// configuration task's stack is what the bound is really about.
[[nodiscard]] bool parse_widget(const cJSON* object,
                                DashboardConfiguration& dashboard,
                                const ReferenceTable& owner,
                                std::uint8_t screen_index,
                                const ParentRef& parent, std::uint8_t depth,
                                ValidationFailure& failure);

}  // namespace simcore::configuration::json
