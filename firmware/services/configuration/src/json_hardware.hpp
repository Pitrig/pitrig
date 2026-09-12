#pragma once

#include "application_configuration.hpp"
#include "cJSON.h"
#include "json_readers.hpp"

namespace pitrig::configuration::json {

[[nodiscard]] bool parse_led_effect(const cJSON* object, LedEffect& config,
                                    ValidationFailure& failure);

[[nodiscard]] bool parse_hardware(const cJSON* array, ApplicationConfiguration& configuration,
                                  ValidationFailure& failure);

}
