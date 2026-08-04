#pragma once

#include "application_configuration.hpp"
#include "display_driver.hpp"
#include "transport.hpp"

namespace simcore::board_registry {

[[nodiscard]] configuration::BoardValidationProfile validation_profile(
    configuration::BoardId board);

// Resolves the selected board to its display driver.
[[nodiscard]] const display::driver::Driver& display_driver(
    configuration::BoardId board);

// Resolves the selected telemetry transport while keeping concrete transport
// implementations outside the firmware core.
[[nodiscard]] transport::ITransport& telemetry_transport(
    const configuration::ApplicationConfiguration& configuration);

}  // namespace simcore::board_registry
