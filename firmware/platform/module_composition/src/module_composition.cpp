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

bool has_lap_timer_modifier(
    const configuration::ApplicationConfiguration& configuration) {
  const auto& dashboard = configuration.dashboard;
  for (std::size_t widget_index = 0;
       widget_index < dashboard.text_widget_count; ++widget_index) {
    const auto& widget = dashboard.text_widgets[widget_index];
    for (std::size_t source_index = 0; source_index < widget.source_count;
         ++source_index) {
      const auto& source = widget.sources[source_index];
      for (std::size_t modifier_index = 0;
           modifier_index < source.modifier_count; ++modifier_index) {
        if (source.modifiers[modifier_index].type ==
            configuration::ValueModifierType::lap_timer) {
          return true;
        }
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
  const bool widgets_enabled = true;
  modules.manager.clear();
  modules.lap_timer_started = false;
  modules.lap_timer_binding = {
      .module = &modules.lap_timer,
      .event_bus = &event_bus,
      .telemetry = &telemetry,
      .handle = telemetry_registry.resolve(telemetry::fields::kCurrentLapTime),
      .started = &modules.lap_timer_started,
  };
  const bool registered = modules.manager.add({
      .enabled = widgets_enabled && has_lap_timer_modifier(configuration),
      .start = &start_lap_timer,
      .stop = &stop_lap_timer,
      .context = &modules.lap_timer_binding,
  });
  if (!registered) {
    modules.manager.clear();
    log::error(kTag, "Failed to register configured modules");
    return false;
  }
  return modules.manager.start_all();
}

}  // namespace simcore::module_composition
