#include "runtime_composition.hpp"

#include "application_configuration.hpp"
#include "boot_splash.hpp"
#include "dashboard_layout.hpp"
#include "delta_time_widget.hpp"
#include "event_bus.hpp"
#include "font_asset_service.hpp"
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
constexpr std::uint32_t kMinimumStartupScreenDurationMs = 1'000;

bool dashboard_will_render_content(
    const configuration::ApplicationConfiguration& configuration) {
#if SIMCORE_DISPLAY_DIAGNOSTICS || SIMCORE_DEBUG
  (void)configuration;
  return true;
#else
  return configuration.dashboard.lap_timer_present ||
         configuration.dashboard.delta_time_present ||
         configuration.dashboard.text_widget_count > 0;
#endif
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
  bool started = true;
  modules.lap_timer_started = false;
  modules.delta_time_started = false;
  const telemetry::Handle lap_time_handle =
      telemetry_registry.resolve(telemetry::fields::kCurrentLapTime);
  const telemetry::Handle lap_delta_handle =
      telemetry_registry.resolve(telemetry::fields::kLapDelta);
  if (widgets_enabled && configuration.lap_timer_present) {
    modules.lap_timer_started = modules.lap_timer.start(
        event_bus, telemetry, lap_time_handle, configuration.lap_timer);
    if (!modules.lap_timer_started) {
      log::error(kTag, "Failed to subscribe Lap Timer to telemetry");
      started = false;
    }
  }
  if (widgets_enabled && configuration.delta_time_present) {
    modules.delta_time_started = modules.delta_time.start(
        event_bus, telemetry, lap_delta_handle, configuration.delta_time);
    if (!modules.delta_time_started) {
      log::error(kTag, "Failed to subscribe Delta Time to telemetry");
      started = false;
    }
  }
  return started;
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
  if (!dashboard::initialize(layout)) {
    log::error(kTag, "Failed to initialize dashboard layout");
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
    if (configuration.dashboard.lap_timer_present) {
      if (!modules.lap_timer_started) {
        log::error(kTag, "Lap Timer widget dependency is unavailable");
        initialized = false;
      } else if (!dashboard::lap_timer_widget::create(
                     layout, configuration.dashboard.lap_timer,
                     modules.lap_timer, dashboard_state.fonts)) {
        log::error(kTag, "Failed to create Lap Timer widget");
        initialized = false;
      }
    }
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
            text_widgets, telemetry_registry)) {
      log::error(kTag, "Failed to bind Text widgets to telemetry");
      initialized = false;
    } else if (!dashboard_state.text_widgets.create(
                   layout, dashboard_state.text_widget_binder.bindings(),
                   telemetry, dashboard_state.fonts)) {
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
