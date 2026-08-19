#pragma once

#include <string_view>

#include "application_configuration.hpp"
#include "display_driver.hpp"
#include "input_driver.hpp"

namespace simcore::board_registry {

struct BoardDefinition {
  configuration::BoardId id{};
  configuration::ValidationContext validation{};
  // Null on a board with no panel — a button box or an LED module — which is a
  // board fact rather than an error, exactly as a missing digitizer is. The
  // core then initializes no display, brings up no LVGL, and composes no
  // dashboard; configuration, transport and modules are unaffected.
  const display::driver::Driver* display{};
  // Null on a board with no digitizer, which is a board fact rather than an
  // error. A pointer rather than a reference is what makes that expressible.
  const input::driver::Driver* input{};
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
