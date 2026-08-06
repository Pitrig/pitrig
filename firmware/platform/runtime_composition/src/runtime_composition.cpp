#include "runtime_composition.hpp"

#include "application_configuration.hpp"
#include "boot_splash.hpp"
#include "dashboard_layout.hpp"
#include "delta_time_widget.hpp"
#include "event_bus.hpp"
#include "font_asset_service.hpp"
#include "logger.hpp"
#include "simcore_features.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"
#include "text_widget.hpp"
#include "transport.hpp"
#if SIMCORE_DISPLAY_DIAGNOSTICS
#include "display_diagnostics.hpp"
#endif
#if SIMCORE_DEBUG
#include "performance_overlay_widget.hpp"
#endif

namespace simcore::runtime_composition {
namespace {

constexpr char kTag[] = "runtime";
constexpr std::uint32_t kMinimumStartupScreenDurationMs = 1'000;

bool dashboard_will_render_content(
    const configuration::ApplicationConfiguration& configuration) {
#if SIMCORE_DISPLAY_DIAGNOSTICS || SIMCORE_DEBUG
  (void)configuration;
  return true;
#else
  return configuration.dashboard.delta_time_present ||
         configuration.dashboard.text_widget_count > 0;
#endif
}

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

[[nodiscard]] bool has_lap_timer_modifier(
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

[[nodiscard]] telemetry::TelemetryRead read_lap_timer_modifier(
    void* const context) {
  telemetry::TelemetryRead value{};
  if (context == nullptr) {
    return value;
  }
  value.handle.type = telemetry::ValueType::uint32;
  value.value.uint32_value =
      static_cast<lap_timer::LapTimer*>(context)->current_time();
  value.available = true;
  return value;
}

}  // namespace

bool show_startup_screen(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration) {
  const bool retain = !dashboard_will_render_content(configuration);
  return dashboard::boot_splash::show(display,
                                      kMinimumStartupScreenDurationMs, retain);
}

bool start_modules(
    Modules& modules, events::EventBus& event_bus,
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
  const telemetry::Handle lap_time_handle =
      telemetry_registry.resolve(telemetry::fields::kCurrentLapTime);
  const telemetry::Handle lap_delta_handle =
      telemetry_registry.resolve(telemetry::fields::kLapDelta);
  modules.lap_timer_binding = {
      .module = &modules.lap_timer,
      .event_bus = &event_bus,
      .telemetry = &telemetry,
      .handle = lap_time_handle,
      .started = &modules.lap_timer_started,
  };
  modules.delta_time_binding = {
      .module = &modules.delta_time,
      .event_bus = &event_bus,
      .telemetry = &telemetry,
      .handle = lap_delta_handle,
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

bool create_dashboard(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration,
    Modules& modules, Dashboard& dashboard_state,
    const font_assets::Service& font_assets,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const transport::ITransport& telemetry_transport) {
  dashboard::Layout layout{
      .display = display,
  };
  if (display == nullptr) {
    log::error(kTag, "Dashboard display is unavailable");
    return false;
  }
  if (!dashboard_state.fonts.initialize(font_assets)) {
    log::warn(kTag, "One or more font assets could not be loaded");
  }

  bool initialized = true;
  bool diagnostics_enabled = false;
#if SIMCORE_DISPLAY_DIAGNOSTICS
  diagnostics_enabled = true;
  if (!dashboard::display_diagnostics::create(
          display, dashboard::display_diagnostics::Config{},
          dashboard_state.fonts)) {
    log::error(kTag, "Failed to start display diagnostics");
    initialized = false;
  }
#endif

  if (!diagnostics_enabled) {
    if (configuration.dashboard.delta_time_present) {
      if (!modules.delta_time_started) {
        log::error(kTag, "Delta Time widget dependency is unavailable");
        initialized = false;
      } else if (!dashboard::delta_time_widget::create(
                     layout, configuration.dashboard.delta_time,
                     modules.delta_time, dashboard_state.fonts)) {
        log::error(kTag, "Failed to create Delta Time widget");
        initialized = false;
      }
    }
    const std::span text_widgets{
        configuration.dashboard.text_widgets.data(),
        static_cast<std::size_t>(
            configuration.dashboard.text_widget_count)};
    if (!dashboard_state.text_widget_binder.bind(
            text_widgets, telemetry_registry, telemetry,
            {
                .read = modules.lap_timer_started
                            ? &read_lap_timer_modifier
                            : nullptr,
                .context = modules.lap_timer_started
                               ? static_cast<void*>(&modules.lap_timer)
                               : nullptr,
            })) {
      log::error(kTag, "Failed to resolve Text widget bindings");
      initialized = false;
    } else if (!dashboard_state.text_widgets.create(
                   layout, dashboard_state.text_widget_binder.bindings(),
                   dashboard_state.fonts)) {
      log::error(kTag, "Failed to create Text widgets");
      initialized = false;
    }
  }

#if SIMCORE_DEBUG
  dashboard::performance_overlay_widget::create(display, telemetry_transport);
#else
  (void)telemetry_transport;
#endif
  return initialized;
}

}  // namespace simcore::runtime_composition
