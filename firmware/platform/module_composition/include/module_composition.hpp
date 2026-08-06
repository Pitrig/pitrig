#pragma once

#include "delta_time.hpp"
#include "lap_timer.hpp"
#include "module_manager.hpp"

namespace simcore::configuration {
struct ApplicationConfiguration;
}
namespace simcore::events {
class EventBus;
}
namespace simcore::telemetry {
class ITelemetryReader;
class ITelemetryRegistry;
}

namespace simcore::module_composition {

struct Modules {
  struct LapTimerBinding {
    lap_timer::LapTimer* module{};
    events::EventBus* event_bus{};
    const telemetry::ITelemetryReader* telemetry{};
    telemetry::Handle handle{};
    bool* started{};
  };
  struct DeltaTimeBinding {
    delta_time::DeltaTime* module{};
    events::EventBus* event_bus{};
    const telemetry::ITelemetryReader* telemetry{};
    telemetry::Handle handle{};
    const delta_time::Config* configuration{};
    bool* started{};
  };

  lap_timer::LapTimer lap_timer;
  delta_time::DeltaTime delta_time;
  LapTimerBinding lap_timer_binding{};
  DeltaTimeBinding delta_time_binding{};
  bool lap_timer_started{};
  bool delta_time_started{};
  modules::Manager manager;
};

[[nodiscard]] bool start(
    Modules& modules, events::EventBus& event_bus,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const configuration::ApplicationConfiguration& configuration);

}  // namespace simcore::module_composition
