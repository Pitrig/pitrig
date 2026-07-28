#include "runtime_composition.hpp"

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"
#include "delta_time_widget.hpp"
#include "driving_aid_widget.hpp"
#include "estimated_lap_time_widget.hpp"
#include "event_bus.hpp"
#include "fuel_widget.hpp"
#include "gear_widget.hpp"
#include "lap_timer_widget.hpp"
#include "logger.hpp"
#include "rpm_widget.hpp"
#include "simcore_features.hpp"
#include "speed_widget.hpp"
#include "telemetry_state.hpp"
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
    const telemetry::ITelemetryReader& telemetry,
    const configuration::ApplicationConfiguration& configuration) {
  bool widgets_enabled = true;
#if SIMCORE_DISPLAY_DIAGNOSTICS
  widgets_enabled = configuration.dashboard.mode ==
                    configuration::DashboardMode::normal;
#endif
  bool started = true;
  if (widgets_enabled && configuration.dashboard.lap_timer.enabled &&
      !modules.lap_timer.start(
          event_bus, telemetry, configuration.lap_timer)) {
    log::error(kTag, "Failed to subscribe Lap Timer to telemetry");
    started = false;
  }
  if (widgets_enabled && configuration.dashboard.delta_time.enabled &&
      !modules.delta_time.start(
          event_bus, telemetry, configuration.delta_time)) {
    log::error(kTag, "Failed to subscribe Delta Time to telemetry");
    started = false;
  }
  if (widgets_enabled &&
      configuration.dashboard.estimated_lap_time.enabled &&
      !modules.estimated_lap_time.start(
          event_bus, telemetry, configuration.estimated_lap_time)) {
    log::error(kTag, "Failed to subscribe Estimated Lap Time to telemetry");
    started = false;
  }
  return started;
}

bool create_dashboard(
    lv_display_t* const display,
    const configuration::ApplicationConfiguration& configuration,
    Modules& modules, const telemetry::ITelemetryReader& telemetry,
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
    if (configuration.dashboard.estimated_lap_time.enabled &&
        !dashboard::estimated_lap_time_widget::create(
            layout, configuration.dashboard.estimated_lap_time,
            modules.estimated_lap_time)) {
      log::error(kTag, "Failed to create Estimated Lap Time widget");
      initialized = false;
    }
    if (configuration.board.id ==
            configuration::BoardId::guition_esp32_4848s040 &&
        configuration.dashboard.gear.enabled &&
        !dashboard::gear_widget::create(
            layout, configuration.dashboard.gear, telemetry)) {
      log::error(kTag, "Failed to create Gear widget");
      initialized = false;
    }
    if (configuration.dashboard.speed.enabled &&
        !dashboard::speed_widget::create(
            layout, configuration.dashboard.speed, telemetry)) {
      log::error(kTag, "Failed to create Speed widget");
      initialized = false;
    }
    if (configuration.dashboard.rpm.enabled &&
        !dashboard::rpm_widget::create(
            layout, configuration.dashboard.rpm, telemetry)) {
      log::error(kTag, "Failed to create RPM widget");
      initialized = false;
    }
    if (configuration.dashboard.fuel.enabled &&
        !dashboard::fuel_widget::create_level(
            layout, configuration.dashboard.fuel, telemetry)) {
      log::error(kTag, "Failed to create Fuel Level widget");
      initialized = false;
    }
    if (configuration.dashboard.fuel_average.enabled &&
        !dashboard::fuel_widget::create_statistic(
            layout, configuration.dashboard.fuel_average,
            dashboard::fuel_widget::Statistic::average_consumption,
            telemetry)) {
      log::error(kTag, "Failed to create Average Fuel Consumption widget");
      initialized = false;
    }
    if (configuration.dashboard.fuel_laps_remaining.enabled &&
        !dashboard::fuel_widget::create_statistic(
            layout, configuration.dashboard.fuel_laps_remaining,
            dashboard::fuel_widget::Statistic::laps_remaining, telemetry)) {
      log::error(kTag, "Failed to create Fuel Laps Remaining widget");
      initialized = false;
    }
    if (configuration.dashboard.traction_control.enabled &&
        !dashboard::driving_aid_widget::create(
            layout, configuration.dashboard.traction_control,
            dashboard::driving_aid_widget::Kind::traction_control,
            telemetry)) {
      log::error(kTag, "Failed to create Traction Control widget");
      initialized = false;
    }
    if (configuration.dashboard.abs.enabled &&
        !dashboard::driving_aid_widget::create(
            layout, configuration.dashboard.abs,
            dashboard::driving_aid_widget::Kind::abs, telemetry)) {
      log::error(kTag, "Failed to create ABS widget");
      initialized = false;
    }
    if (configuration.dashboard.brake_bias.enabled &&
        !dashboard::driving_aid_widget::create(
            layout, configuration.dashboard.brake_bias,
            dashboard::driving_aid_widget::Kind::brake_bias, telemetry)) {
      log::error(kTag, "Failed to create Brake Bias widget");
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
