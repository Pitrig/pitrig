#pragma once

#include <array>
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
  // One compiled factory document per configuration document, in
  // ConfigurationDocument order. Each is a complete document carrying the board
  // identifier, so a board with nothing stored answers `@SC:GET:<DOC>` with the
  // bytes it is actually running rather than with a section carved out of a
  // larger payload — the device has no serializer to carve one with.
  std::array<std::string_view, configuration::kConfigurationDocumentCount>
      factory_configuration_json{};
};

// Returns the single immutable board selected by the firmware build.
[[nodiscard]] const BoardDefinition& factory_board();

// Resolves an explicit transport selection or the immutable board default.
[[nodiscard]] configuration::TelemetryTransportId telemetry_transport_id(
    const BoardDefinition& board,
    const configuration::ApplicationConfiguration& configuration);

}  // namespace simcore::board_registry
