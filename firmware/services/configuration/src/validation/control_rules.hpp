#pragma once

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"

namespace pitrig::configuration::validation {

[[nodiscard]] bool validate_controls(const DashboardConfiguration& dashboard,
                                     ValidationFailure& failure);

}
