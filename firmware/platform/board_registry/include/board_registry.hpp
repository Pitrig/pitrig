#pragma once

#include "display_driver.hpp"
#include "transport.hpp"

namespace simcore::board_registry {

// Resolves the board configured for this application to its display driver.
[[nodiscard]] const display::driver::Driver& display_driver();

// Resolves the configured telemetry transport while keeping concrete transport
// implementations outside the firmware core.
[[nodiscard]] transport::ITransport& telemetry_transport();

}  // namespace simcore::board_registry
