#pragma once

#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"
#include "cJSON.h"

namespace pitrig::configuration::json {

struct ReferenceTable {
  std::span<WidgetReference> entries;
  std::uint8_t* count;
};

struct ParentRef {
  WidgetParentKind kind{WidgetParentKind::screen};
  std::uint8_t index{};
};

[[nodiscard]] bool parse_widget(const cJSON* object,
                                DashboardConfiguration& dashboard,
                                const ReferenceTable& owner,
                                std::uint8_t screen_index,
                                const ParentRef& parent, std::uint8_t depth,
                                ValidationFailure& failure);

}
