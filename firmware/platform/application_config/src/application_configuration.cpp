#include "application_configuration.hpp"

namespace simcore::configuration {

BoardId board_id() {
  return kApplicationConfiguration.board.id;
}

const TelemetryTransportConfiguration& telemetry_transport_configuration() {
  return kApplicationConfiguration.telemetry_transport;
}

DashboardMode dashboard_mode() {
  return kApplicationConfiguration.dashboard.mode;
}

}  // namespace simcore::configuration
