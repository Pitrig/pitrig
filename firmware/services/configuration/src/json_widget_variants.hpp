#pragma once

#include <array>
#include <cstdint>

#include "application_configuration.hpp"
#include "cJSON.h"
#include "configuration_schema_generated.hpp"

namespace simcore::configuration::json {

// Fills one instance of one variant. Indexed by the discriminator exactly as
// the generated traits table is, so the two stay aligned by construction.
// Storage bookkeeping — capacity, index, count — belongs to the traits table;
// an entry here only knows how to fill its own variant.
using WidgetParser = bool (*)(const cJSON*, DashboardConfiguration&,
                              std::uint8_t index, ValidationFailure&);

extern const std::array<WidgetParser, kWidgetTypeTraits.size()> kWidgetParsers;

}  // namespace simcore::configuration::json
