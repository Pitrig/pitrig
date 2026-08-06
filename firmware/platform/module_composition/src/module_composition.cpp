#include "module_composition.hpp"

#include "application_configuration.hpp"
#include "event_bus.hpp"
#include "logger.hpp"
#include "simcore_features.hpp"
#include "telemetry_registry.hpp"

namespace simcore::module_composition {
namespace {

constexpr char kTag[] = "modules";

bool start_lap_timer(void* const context) {
  auto& binding = *static_cast<Modules::LapTimerBinding*>(context);
  if (binding.module == nullptr || binding.event_bus == nullptr ||
      binding.telemetry == nullptr || binding.started == nullptr) {
    return false;
  }
  *binding.started = binding.module->start(
      *binding.event_bus, *binding.telemetry, binding.handle);
  if (!*binding.started) {
    log::error(kTag, "Failed to subscribe Lap Timer to telemetry");
  }
  return *binding.started;
}

void stop_lap_timer(void* const context) {
  auto& binding = *static_cast<Modules::LapTimerBinding*>(context);
  if (binding.module != nullptr) {
    binding.module->stop();
  }
  if (binding.started != nullptr) {
    *binding.started = false;
  }
}

bool start_delta_time(void* const context) {
  auto& binding = *static_cast<Modules::DeltaTimeBinding*>(context);
  if (binding.module == nullptr || binding.event_bus == nullptr ||
      binding.telemetry == nullptr || binding.configuration == nullptr ||
      binding.started == nullptr) {
    return false;
  }
  *binding.started = binding.module->start(
      *binding.event_bus, *binding.telemetry, binding.handle,
      *binding.configuration);
  if (!*binding.started) {
    log::error(kTag, "Failed to subscribe Delta Time to telemetry");
  }
  return *binding.started;
}

void stop_delta_time(void* const context) {
  auto& binding = *static_cast<Modules::DeltaTimeBinding*>(context);
  if (binding.module != nullptr) {
    binding.module->stop();
  }
  if (binding.started != nullptr) {
    *binding.started = false;
  }
}

bool has_lap_timer_modifier(
    const configuration::ApplicationConfiguration& configuration) {
  for (std::size_t widget_index = 0;
       widget_index < configuration.dashboard.text_widget_count;
       ++widget_index) {
    const auto& widget = configuration.dashboard.text_widgets[widget_index];
    for (std::size_t modifier_index = 0;
         modifier_index < widget.modifier_count; ++modifier_index) {
      if (widget.modifiers[modifier_index].type ==
          configuration::ValueModifierType::lap_timer) {
        return true;
      }
    }
  }
  return false;
}

}  // namespace

bool start(Modules& modules, events::EventBus& event_bus,
           const telemetry::ITelemetryRegistry& telemetry_registry,
           const telemetry::ITelemetryReader& telemetry,
           const configuration::ApplicationConfiguration& configuration) {
  bool widgets_enabled = true;
#if SIMCORE_DISPLAY_DIAGNOSTICS
  widgets_enabled = false;
#endif
  modules.manager.clear();
  modules.lap_timer_started = false;
  modules.delta_time_started = false;
  modules.lap_timer_binding = {
      .module = &modules.lap_timer,
      .event_bus = &event_bus,
      .telemetry = &telemetry,
      .handle = telemetry_registry.resolve(telemetry::fields::kCurrentLapTime),
      .started = &modules.lap_timer_started,
  };
  modules.delta_time_binding = {
      .module = &modules.delta_time,
      .event_bus = &event_bus,
      .telemetry = &telemetry,
      .handle = telemetry_registry.resolve(telemetry::fields::kLapDelta),
      .configuration = &configuration.delta_time,
      .started = &modules.delta_time_started,
  };
  const bool registered =
      modules.manager.add({
          .enabled = widgets_enabled && has_lap_timer_modifier(configuration),
          .start = &start_lap_timer,
          .stop = &stop_lap_timer,
          .context = &modules.lap_timer_binding,
      }) &&
      modules.manager.add({
          .enabled = widgets_enabled && configuration.delta_time_present,
          .start = &start_delta_time,
          .stop = &stop_delta_time,
          .context = &modules.delta_time_binding,
      });
  if (!registered) {
    modules.manager.clear();
    log::error(kTag, "Failed to register configured modules");
    return false;
  }
  return modules.manager.start_all();
}

}  // namespace simcore::module_composition
