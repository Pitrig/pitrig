#pragma once

#include <array>
#include <cstdint>

#include "application_configuration.hpp"
#include "cJSON.h"
#include "configuration_schema_generated.hpp"

namespace simcore::configuration::json {

using WidgetParser = bool (*)(const cJSON*, DashboardConfiguration&,
                              std::uint8_t index, ValidationFailure&);

extern const std::array<WidgetParser, kWidgetTypeTraits.size()> kWidgetParsers;

}
