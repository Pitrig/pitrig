#include "simcore.hpp"

#include "application_configuration.hpp"
#include "board_registry.hpp"
#include "delta_time.hpp"
#include "delta_time_widget.hpp"
#include "estimated_lap_time.hpp"
#include "estimated_lap_time_widget.hpp"
#include "lap_timer_widget.hpp"
#include "lap_timer.hpp"
#include "display.hpp"
#include "event_bus.hpp"
#include "logger.hpp"
#include "simhub_protocol.hpp"
#include "simcore_features.hpp"
#include "telemetry_provider.hpp"
#include "telemetry_state.hpp"
#if SIMCORE_DISPLAY_DIAGNOSTICS
#include "display_diagnostics.hpp"
#endif
#if SIMCORE_DEBUG
#include "performance.hpp"
#include "performance_overlay_widget.hpp"
#endif

namespace simcore {
namespace {

constexpr char kTag[] = "simcore";

struct Application {
  events::EventBus event_bus;
  telemetry::TelemetryStateService telemetry_state;
  telemetry::TelemetryProvider telemetry_provider{telemetry_state, event_bus};
  protocols::SimHubProtocol protocol;
  lap_timer::LapTimer lap_timer;
  delta_time::DeltaTime delta_time;
  estimated_lap_time::EstimatedLapTime estimated_lap_time;
};

void submit_update(const telemetry::TelemetryUpdate& update, void* const context) {
  static_cast<Application*>(context)->telemetry_provider.submit(update);
}

void receive_transport_data(const std::span<const std::uint8_t> data, void* const context) {
  auto& application = *static_cast<Application*>(context);
  application.protocol.consume(data, &submit_update, &application);
}

}

void run() {
  static Application application;
  transport::ITransport& telemetry_transport =
      board_registry::telemetry_transport();

  log::info(kTag, "SimCore starting");
#if SIMCORE_DEBUG
  performance::begin();
#endif
  lv_display_t* display = display::initialize(board_registry::display_driver());
  dashboard::Layout dashboard_layout{
      .display = display,
      .regions = configuration::kApplicationConfiguration.dashboard.regions,
  };
  const bool dashboard_ready = dashboard::initialize(dashboard_layout);
  if (!dashboard_ready) {
    log::error(kTag, "Failed to initialize dashboard layout");
  }
  if (!application.lap_timer.start(
          application.event_bus, application.telemetry_state,
          configuration::kApplicationConfiguration.lap_timer)) {
    log::error(kTag, "Failed to subscribe Lap Timer to telemetry");
  }
  if (!application.delta_time.start(
          application.event_bus, application.telemetry_state,
          configuration::kApplicationConfiguration.delta_time)) {
    log::error(kTag, "Failed to subscribe Delta Time to telemetry");
  }
  if (!application.estimated_lap_time.start(
          application.event_bus, application.telemetry_state,
          configuration::kApplicationConfiguration.estimated_lap_time)) {
    log::error(kTag, "Failed to subscribe Estimated Lap Time to telemetry");
  }
  bool diagnostics_enabled = false;
#if SIMCORE_DISPLAY_DIAGNOSTICS
  diagnostics_enabled =
      configuration::dashboard_mode() ==
      configuration::DashboardMode::display_diagnostics;
  if (dashboard_ready && diagnostics_enabled &&
      !dashboard::display_diagnostics::create(
          display,
          configuration::kApplicationConfiguration.dashboard
              .display_diagnostics)) {
    log::error(kTag, "Failed to start display diagnostics");
  }
#endif
  if (dashboard_ready && !diagnostics_enabled &&
      !dashboard::lap_timer_widget::create(
          dashboard_layout,
          configuration::kApplicationConfiguration.dashboard.lap_timer,
          application.lap_timer)) {
    log::error(kTag, "Failed to create Lap Timer widget");
  }
  if (dashboard_ready && !diagnostics_enabled &&
      !dashboard::delta_time_widget::create(
          dashboard_layout,
          configuration::kApplicationConfiguration.dashboard.delta_time,
          application.delta_time)) {
    log::error(kTag, "Failed to create Delta Time widget");
  }
  if (dashboard_ready && !diagnostics_enabled &&
      !dashboard::estimated_lap_time_widget::create(
          dashboard_layout,
          configuration::kApplicationConfiguration.dashboard
              .estimated_lap_time,
          application.estimated_lap_time)) {
    log::error(kTag, "Failed to create Estimated Lap Time widget");
  }
#if SIMCORE_DEBUG
  dashboard::performance_overlay_widget::create(display, telemetry_transport);
#endif
  if (!telemetry_transport.start(&receive_transport_data, &application)) {
    log::error(kTag, "Failed to start telemetry transport");
  }
}

}
