#pragma once

#include "application_configuration.hpp"
#include "cJSON.h"
#include "validation_failure.hpp"

namespace pitrig::configuration::json {

[[nodiscard]] bool parse_controls(const cJSON* object, ControlsConfiguration& controls,
                                  ValidationFailure& failure);

}
