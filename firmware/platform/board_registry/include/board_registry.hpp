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
  const display::driver::Driver* display{};
  const input::driver::Driver* input{};
  configuration::TelemetryTransportId default_telemetry_transport{};
  std::array<std::string_view, configuration::kConfigurationDocumentCount>
      factory_configuration_json{};
};

[[nodiscard]] const BoardDefinition& factory_board();

[[nodiscard]] configuration::TelemetryTransportId telemetry_transport_id(
    const BoardDefinition& board,
    const configuration::ApplicationConfiguration& configuration);

}
