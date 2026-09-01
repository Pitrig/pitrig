#pragma once

#include <cstddef>
#include <cstdint>

#include "application_configuration.hpp"
#include "configuration_schema_generated.hpp"

namespace simcore::configuration::validation {

[[nodiscard]] bool validate_led_effects(
    const HardwareDeviceConfiguration& device, ValidationFailure& failure);

[[nodiscard]] bool validate_hardware(
    const ApplicationConfiguration& configuration,
    const ValidationContext& profile, ValidationFailure& failure);

}
