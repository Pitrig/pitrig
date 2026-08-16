#pragma once

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
  lap_timer::LapTimer lap_timer;
  LapTimerBinding lap_timer_binding{};
  bool lap_timer_started{};
  modules::Manager manager;
};

[[nodiscard]] bool start(
    Modules& modules, events::EventBus& event_bus,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const configuration::ApplicationConfiguration& configuration);

}  // namespace simcore::module_composition
