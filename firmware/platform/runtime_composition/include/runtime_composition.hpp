#pragma once

#include "delta_time.hpp"
#include "estimated_lap_time.hpp"
#include "lap_timer.hpp"

struct _lv_display_t;
using lv_display_t = _lv_display_t;

namespace simcore::configuration {
struct ApplicationConfiguration;
}

namespace simcore::events {
class EventBus;
}

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::transport {
class ITransport;
}

namespace simcore::runtime_composition {

// Owns the fixed set of feature modules selected for this application.
struct Modules {
  lap_timer::LapTimer lap_timer;
  delta_time::DeltaTime delta_time;
  estimated_lap_time::EstimatedLapTime estimated_lap_time;
};

// Starts every configured feature module against shared platform services.
[[nodiscard]] bool start_modules(
    Modules& modules, events::EventBus& event_bus,
    const telemetry::ITelemetryReader& telemetry,
    const configuration::ApplicationConfiguration& configuration);

// Creates the configured platform dashboard and its widget composition.
[[nodiscard]] bool create_dashboard(
    lv_display_t* display,
    const configuration::ApplicationConfiguration& configuration,
    Modules& modules, const telemetry::ITelemetryReader& telemetry,
    const transport::ITransport& telemetry_transport);

}  // namespace simcore::runtime_composition
