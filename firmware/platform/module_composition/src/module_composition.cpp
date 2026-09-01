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

bool start_rgb_leds(void* const context) {
  auto& binding = *static_cast<Modules::RgbLedsBinding*>(context);
  if (binding.module == nullptr || binding.event_bus == nullptr ||
      binding.registry == nullptr || binding.telemetry == nullptr ||
      binding.driver == nullptr || binding.configuration == nullptr ||
      binding.started == nullptr) {
    return false;
  }
  *binding.started =
      binding.module->start(*binding.event_bus, *binding.registry,
                            *binding.telemetry, *binding.driver,
                            *binding.configuration);
  if (!*binding.started) {
    log::error(kTag, "No addressable LED output came up");
  }
  return *binding.started;
}

void stop_rgb_leds(void* const context) {
  auto& binding = *static_cast<Modules::RgbLedsBinding*>(context);
  if (binding.module != nullptr) {
    binding.module->stop();
  }
  if (binding.started != nullptr) {
    *binding.started = false;
  }
}

[[nodiscard]] bool has_rgb_output(
    const configuration::ApplicationConfiguration& configuration) {
  return configuration.device_count > 0;
}

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

}

bool lap_timer_used(
    const configuration::ApplicationConfiguration& configuration) {
  const auto& dashboard = configuration.dashboard;

  if (configuration::any_widget_frame(
          dashboard, [](const configuration::WidgetFrame& frame) {
            return uses_lap_timer(frame.condition_source);
          })) {
    return true;
  }

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
  for (std::size_t index = 0; index < dashboard.graph_widget_count; ++index) {
    const auto& widget = dashboard.graph_widgets[index];
    for (std::size_t trace = 0; trace < widget.trace_count; ++trace) {
      if (uses_lap_timer(widget.traces[trace].source)) {
        return true;
      }
    }
  }
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

bool start(Modules& modules, events::EventBus& event_bus,
           const telemetry::ITelemetryRegistry& telemetry_registry,
           const telemetry::ITelemetryReader& telemetry,
           const led::driver::Driver* const led_driver,
           const configuration::ApplicationConfiguration& configuration) {
  modules.manager.clear();
  modules.lap_timer_started = false;
  modules.rgb_leds_started = false;
  modules.lap_timer_binding = {
      .module = &modules.lap_timer,
      .event_bus = &event_bus,
      .telemetry = &telemetry,
      .handle = telemetry_registry.resolve(telemetry::fields::kCurrentLapTime),
      .started = &modules.lap_timer_started,
  };
  const bool registered = modules.manager.add({
      .enabled = lap_timer_used(configuration),
      .start = &start_lap_timer,
      .stop = &stop_lap_timer,
      .context = &modules.lap_timer_binding,
  });
  modules.rgb_leds_binding = {
      .module = &modules.rgb_leds,
      .event_bus = &event_bus,
      .registry = &telemetry_registry,
      .telemetry = &telemetry,
      .driver = led_driver,
      .configuration = &configuration,
      .started = &modules.rgb_leds_started,
  };
  const bool leds_registered = modules.manager.add({
      .enabled = led_driver != nullptr && has_rgb_output(configuration),
      .start = &start_rgb_leds,
      .stop = &stop_rgb_leds,
      .context = &modules.rgb_leds_binding,
  });
  if (!registered || !leds_registered) {
    modules.manager.clear();
    log::error(kTag, "Failed to register configured modules");
    return false;
  }
  return modules.manager.start_all();
}

}
