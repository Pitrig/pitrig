#include "dashboard_composition.hpp"

#include "application_configuration.hpp"
#include "boot_splash.hpp"
#include "dashboard_layout.hpp"
#include "font_asset_service.hpp"
#include "logger.hpp"
#include "module_composition.hpp"
#include "simcore_features.hpp"
#include "telemetry_registry.hpp"
#if SIMCORE_DISPLAY_DIAGNOSTICS
#include "display_diagnostics.hpp"
#endif

namespace simcore::dashboard_composition {
namespace {

constexpr char kTag[] = "dashboard";
constexpr std::uint32_t kMinimumStartupScreenDurationMs = 1'000;

bool will_render_content(
    const configuration::ApplicationConfiguration& configuration) {
#if SIMCORE_DISPLAY_DIAGNOSTICS || SIMCORE_DEBUG
  (void)configuration;
  return true;
#else
  return configuration.dashboard.delta_time_present ||
         configuration.dashboard.text_widget_count > 0;
#endif
}

telemetry::TelemetryRead read_lap_timer_modifier(void* const context) {
  telemetry::TelemetryRead value{};
  if (context == nullptr) {
    return value;
  }
  const lap_timer::LapTimer::Snapshot snapshot =
      static_cast<lap_timer::LapTimer*>(context)->snapshot();
  value.handle.type = telemetry::ValueType::uint32;
  value.value.uint32_value = snapshot.time_ms;
  value.available = snapshot.available;
  return value;
}

}  // namespace

bool show_startup_screen(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration) {
  return dashboard::boot_splash::show(
      display, kMinimumStartupScreenDurationMs,
      !will_render_content(configuration));
}

bool create(lv_display_t* const display,
            const configuration::ApplicationConfiguration& configuration,
            module_composition::Modules& modules, Dashboard& dashboard_state,
            const font_assets::Service& font_assets,
            const telemetry::ITelemetryRegistry& telemetry_registry,
            const telemetry::ITelemetryReader& telemetry,
            const transport::ITransport& telemetry_transport) {
  if (display == nullptr) {
    log::error(kTag, "Dashboard display is unavailable");
    return false;
  }
  const dashboard::Layout layout{.display = display};
  if (!dashboard_state.fonts.initialize(font_assets)) {
    log::warn(kTag, "One or more font assets could not be loaded");
  }

  bool initialized = true;
  bool diagnostics_enabled = false;
#if SIMCORE_DISPLAY_DIAGNOSTICS
  diagnostics_enabled = true;
  if (!dashboard_state.display_diagnostics.create(
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
      } else if (!dashboard_state.delta_time_widget.create(
                     layout, configuration.dashboard.delta_time,
                     modules.delta_time, dashboard_state.fonts)) {
        log::error(kTag, "Failed to create Delta Time widget");
        initialized = false;
      }
    }
    const std::span text_widgets{
        configuration.dashboard.text_widgets.data(),
        static_cast<std::size_t>(configuration.dashboard.text_widget_count)};
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
  if (!dashboard_state.performance_overlay.create(display,
                                                  telemetry_transport)) {
    log::warn(kTag, "Failed to create performance overlay");
  }
#else
  (void)telemetry_transport;
#endif
  return initialized;
}

}  // namespace simcore::dashboard_composition
