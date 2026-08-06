#pragma once

#include <string_view>

#include "application_configuration.hpp"
#include "display_driver.hpp"

namespace simcore::board_registry {

struct BoardDefinition {
  configuration::BoardId id{};
  configuration::ValidationContext validation{};
  const display::driver::Driver& display;
  configuration::TelemetryTransportId default_telemetry_transport{};
  std::string_view factory_configuration_json{};
};

// Returns the single immutable board selected by the firmware build.
[[nodiscard]] const BoardDefinition& factory_board();

// Resolves an explicit transport selection or the immutable board default.
[[nodiscard]] configuration::TelemetryTransportId telemetry_transport_id(
    const BoardDefinition& board,
    const configuration::ApplicationConfiguration& configuration);

}  // namespace simcore::board_registry
