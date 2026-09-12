#pragma once

#include <cstddef>

#include "lap_timer.hpp"
#include "led_driver.hpp"
#include "module_manager.hpp"
#include "rgb_leds.hpp"

namespace pitrig::configuration {
struct ApplicationConfiguration;
}
namespace pitrig::events {
class EventBus;
}
namespace pitrig::telemetry {
class ITelemetryReader;
class ITelemetryRegistry;
}

namespace pitrig::module_composition {

enum class Module : std::size_t {
  lap_timer,
  rgb_leds,
};

struct Modules {
  struct LapTimerBinding {
    lap_timer::LapTimer* module{};
    events::EventBus* event_bus{};
    const telemetry::ITelemetryReader* telemetry{};
    telemetry::Handle handle{};
    bool* started{};
  };
  struct RgbLedsBinding {
    rgb_leds::RgbLeds* module{};
    events::EventBus* event_bus{};
    const telemetry::ITelemetryRegistry* registry{};
    const telemetry::ITelemetryReader* telemetry{};
    const led::driver::Driver* driver{};
    const configuration::ApplicationConfiguration* configuration{};
    bool* started{};
  };
  lap_timer::LapTimer lap_timer;
  LapTimerBinding lap_timer_binding{};
  bool lap_timer_started{};
  rgb_leds::RgbLeds rgb_leds;
  RgbLedsBinding rgb_leds_binding{};
  bool rgb_leds_started{};
  modules::Manager manager;
};

[[nodiscard]] bool start(Modules& modules, events::EventBus& event_bus,
                         const telemetry::ITelemetryRegistry& telemetry_registry,
                         const telemetry::ITelemetryReader& telemetry,
                         const led::driver::Driver* led_driver,
                         const configuration::ApplicationConfiguration& configuration);

[[nodiscard]] bool restart(Modules& modules, Module module,
                           const configuration::ApplicationConfiguration& configuration);

[[nodiscard]] bool lap_timer_used(const configuration::ApplicationConfiguration& configuration);

}
