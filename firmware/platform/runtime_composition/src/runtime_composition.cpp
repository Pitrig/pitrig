#include "runtime_composition.hpp"

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"
#include "delta_time_widget.hpp"
#include "event_bus.hpp"
#include "lap_timer_widget.hpp"
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

}  // namespace

bool start_modules(
    Modules& modules, events::EventBus& event_bus,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const configuration::ApplicationConfiguration& configuration) {
  bool widgets_enabled = true;
#if SIMCORE_DISPLAY_DIAGNOSTICS
  widgets_enabled = configuration.dashboard.mode ==
                    configuration::DashboardMode::normal;
#endif
  bool started = true;
  const telemetry::Handle lap_time_handle =
      telemetry_registry.resolve(telemetry::fields::kCurrentLapTime);
  const telemetry::Handle lap_delta_handle =
      telemetry_registry.resolve(telemetry::fields::kLapDelta);
  if (widgets_enabled && configuration.dashboard.lap_timer.enabled &&
      !modules.lap_timer.start(
          event_bus, telemetry, lap_time_handle, configuration.lap_timer)) {
    log::error(kTag, "Failed to subscribe Lap Timer to telemetry");
    started = false;
  }
  if (widgets_enabled && configuration.dashboard.delta_time.enabled &&
      !modules.delta_time.start(
          event_bus, telemetry, lap_delta_handle, configuration.delta_time)) {
    log::error(kTag, "Failed to subscribe Delta Time to telemetry");
    started = false;
  }
  return started;
}

bool create_dashboard(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration,
    Modules& modules, Dashboard& dashboard_state,
    const telemetry::ITelemetryRegistry& telemetry_registry,
    const telemetry::ITelemetryReader& telemetry,
    const transport::ITransport& telemetry_transport) {
  dashboard::Layout layout{
      .display = display,
      .regions = configuration.dashboard.regions,
  };
  if (!dashboard::initialize(layout)) {
    log::error(kTag, "Failed to initialize dashboard layout");
    return false;
  }

  bool initialized = true;
  bool diagnostics_enabled = false;
#if SIMCORE_DISPLAY_DIAGNOSTICS
  diagnostics_enabled = configuration.dashboard.mode ==
                        configuration::DashboardMode::display_diagnostics;
  if (diagnostics_enabled &&
      !dashboard::display_diagnostics::create(
          display, configuration.dashboard.display_diagnostics)) {
    log::error(kTag, "Failed to start display diagnostics");
    initialized = false;
  }
#endif

  if (!diagnostics_enabled) {
    if (configuration.dashboard.lap_timer.enabled &&
        !dashboard::lap_timer_widget::create(
            layout, configuration.dashboard.lap_timer, modules.lap_timer)) {
      log::error(kTag, "Failed to create Lap Timer widget");
      initialized = false;
    }
    if (configuration.dashboard.delta_time.enabled &&
        !dashboard::delta_time_widget::create(
            layout, configuration.dashboard.delta_time, modules.delta_time)) {
      log::error(kTag, "Failed to create Delta Time widget");
      initialized = false;
    }
    const std::span text_widgets{
        configuration.dashboard.text_widgets.data(),
        static_cast<std::size_t>(
            configuration.dashboard.text_widget_count)};
    if (!dashboard_state.text_widget_binder.bind(
            text_widgets, telemetry_registry)) {
      log::error(kTag, "Failed to bind Text widgets to telemetry");
      initialized = false;
    } else if (!dashboard_state.text_widgets.create(
                   layout, dashboard_state.text_widget_binder.bindings(),
                   telemetry)) {
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
