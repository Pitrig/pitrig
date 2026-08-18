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

// A text source and a mapped source are separate structs that agree on the
// modifier list, so this reads either.
template <typename Source>
[[nodiscard]] bool uses_lap_timer(const Source& source) {
  for (std::size_t index = 0; index < source.modifier_count; ++index) {
    if (source.modifiers[index].type ==
        configuration::ValueModifierType::lap_timer) {
      return true;
    }
  }
  return false;
}

// Every place a modifier can be authored, not only the text sources. A bar,
// arc, indicator or graph binds one the same way, and so does the source a
// styling rule watches or a slot activates on. Counting one of those places
// and not the others left the module stopped behind a reader that would then
// never report a value — the modifier looked configured and did nothing.
bool has_lap_timer_modifier(
    const configuration::ApplicationConfiguration& configuration) {
  const auto& dashboard = configuration.dashboard;

  const auto conditioned = [](const auto& widgets, const std::size_t count) {
    for (std::size_t index = 0; index < count; ++index) {
      if (uses_lap_timer(widgets[index].frame.condition_source)) {
        return true;
      }
    }
    return false;
  };
  const auto mapped = [](const auto& widgets, const std::size_t count) {
    for (std::size_t index = 0; index < count; ++index) {
      if (uses_lap_timer(widgets[index].source)) {
        return true;
      }
    }
    return false;
  };

  for (std::size_t index = 0; index < dashboard.text_widget_count; ++index) {
    const auto& widget = dashboard.text_widgets[index];
    for (std::size_t source = 0; source < widget.source_count; ++source) {
      if (uses_lap_timer(widget.sources[source])) {
        return true;
      }
    }
  }
  if (mapped(dashboard.bar_widgets, dashboard.bar_widget_count) ||
      mapped(dashboard.arc_widgets, dashboard.arc_widget_count) ||
      mapped(dashboard.indicator_widgets, dashboard.indicator_widget_count) ||
      mapped(dashboard.graph_widgets, dashboard.graph_widget_count)) {
    return true;
  }
  if (conditioned(dashboard.text_widgets, dashboard.text_widget_count) ||
      conditioned(dashboard.shape_widgets, dashboard.shape_widget_count) ||
      conditioned(dashboard.bar_widgets, dashboard.bar_widget_count) ||
      conditioned(dashboard.arc_widgets, dashboard.arc_widget_count) ||
      conditioned(dashboard.indicator_widgets,
                  dashboard.indicator_widget_count) ||
      conditioned(dashboard.graph_widgets, dashboard.graph_widget_count) ||
      conditioned(dashboard.image_widgets, dashboard.image_widget_count) ||
      conditioned(dashboard.slot_widgets, dashboard.slot_widget_count)) {
    return true;
  }
  // A slot page watches its own source, separate from the styling rules the
  // sweep above covers, so a lap_timer modifier there would otherwise leave the
  // module unstarted and the page never appearing.
  for (std::size_t index = 0; index < dashboard.slot_widget_count; ++index) {
    const auto& widget = dashboard.slot_widgets[index];
    for (std::size_t page = 0; page < widget.page_count; ++page) {
      if (uses_lap_timer(widget.pages[page].source)) {
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
