#include "simcore.hpp"

#include "application_configuration.hpp"
#include "board_registry.hpp"
#include "configuration_control.hpp"
#include "configuration_router.hpp"
#include "configuration_service.hpp"
#include "delta_time.hpp"
#include "delta_time_widget.hpp"
#include "estimated_lap_time.hpp"
#include "estimated_lap_time_widget.hpp"
#include "gear_widget.hpp"
#include "lap_timer_widget.hpp"
#include "lap_timer.hpp"
#include "display.hpp"
#include "event_bus.hpp"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "logger.hpp"
#include "nvs_config_storage.hpp"
#include "simhub_protocol.hpp"
#include "simcore_features.hpp"
#include "speed_widget.hpp"
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
  configuration::NvsConfigurationStorage configuration_storage;
  configuration::ConfigurationService configuration_service;
  configuration::ConfigurationControl configuration_control;
  configuration::ConfigurationRouter configuration_router;
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

void receive_telemetry_data(const std::span<const std::uint8_t> data,
                            void* const context) {
  auto& application = *static_cast<Application*>(context);
  application.protocol.consume(data, &submit_update, &application);
}

void receive_transport_data(const std::span<const std::uint8_t> data,
                            void* const context) {
  static_cast<Application*>(context)->configuration_router.consume(data);
}

void reboot(void*) {
  vTaskDelay(pdMS_TO_TICKS(100));
  esp_restart();
}

}

void run() {
  static Application application;
  if (!application.configuration_service.initialize(
          application.configuration_storage,
          configuration::kFactoryConfiguration)) {
    log::warn(kTag,
              "Configuration storage unavailable; using factory defaults");
  }
  const configuration::ApplicationConfiguration& configuration =
      application.configuration_service.current();
  transport::ITransport& telemetry_transport =
      board_registry::telemetry_transport(configuration);

  log::info(kTag, "SimCore starting");
#if SIMCORE_DEBUG
  performance::begin();
#endif
  lv_display_t* display =
      display::initialize(board_registry::display_driver(configuration.board.id));
  dashboard::Layout dashboard_layout{
      .display = display,
      .regions = configuration.dashboard.regions,
  };
  const bool dashboard_ready = dashboard::initialize(dashboard_layout);
  if (!dashboard_ready) {
    log::error(kTag, "Failed to initialize dashboard layout");
  }
  if (!application.lap_timer.start(
          application.event_bus, application.telemetry_state,
          configuration.lap_timer)) {
    log::error(kTag, "Failed to subscribe Lap Timer to telemetry");
  }
  if (!application.delta_time.start(
          application.event_bus, application.telemetry_state,
          configuration.delta_time)) {
    log::error(kTag, "Failed to subscribe Delta Time to telemetry");
  }
  if (!application.estimated_lap_time.start(
          application.event_bus, application.telemetry_state,
          configuration.estimated_lap_time)) {
    log::error(kTag, "Failed to subscribe Estimated Lap Time to telemetry");
  }
  bool diagnostics_enabled = false;
#if SIMCORE_DISPLAY_DIAGNOSTICS
  diagnostics_enabled = configuration.dashboard.mode ==
                        configuration::DashboardMode::display_diagnostics;
  if (dashboard_ready && diagnostics_enabled &&
      !dashboard::display_diagnostics::create(
          display,
          configuration.dashboard.display_diagnostics)) {
    log::error(kTag, "Failed to start display diagnostics");
  }
#endif
  if (dashboard_ready && !diagnostics_enabled &&
      configuration.dashboard.lap_timer.enabled &&
      !dashboard::lap_timer_widget::create(
          dashboard_layout,
          configuration.dashboard.lap_timer,
          application.lap_timer)) {
    log::error(kTag, "Failed to create Lap Timer widget");
  }
  if (dashboard_ready && !diagnostics_enabled &&
      configuration.dashboard.delta_time.enabled &&
      !dashboard::delta_time_widget::create(
          dashboard_layout,
          configuration.dashboard.delta_time,
          application.delta_time)) {
    log::error(kTag, "Failed to create Delta Time widget");
  }
  if (dashboard_ready && !diagnostics_enabled &&
      configuration.dashboard.estimated_lap_time.enabled &&
      !dashboard::estimated_lap_time_widget::create(
          dashboard_layout,
          configuration.dashboard.estimated_lap_time,
          application.estimated_lap_time)) {
    log::error(kTag, "Failed to create Estimated Lap Time widget");
  }
  if (dashboard_ready && !diagnostics_enabled &&
      configuration.board.id ==
          configuration::BoardId::guition_esp32_4848s040 &&
      configuration.dashboard.gear.enabled &&
      !dashboard::gear_widget::create(
          dashboard_layout, configuration.dashboard.gear,
          application.telemetry_state)) {
    log::error(kTag, "Failed to create Gear widget");
  }
  if (dashboard_ready && !diagnostics_enabled &&
      configuration.dashboard.speed.enabled &&
      !dashboard::speed_widget::create(
          dashboard_layout, configuration.dashboard.speed,
          application.telemetry_state)) {
    log::error(kTag, "Failed to create Speed widget");
  }
#if SIMCORE_DEBUG
  dashboard::performance_overlay_widget::create(display, telemetry_transport);
#endif
  application.configuration_control.initialize(
      application.configuration_service, telemetry_transport, &reboot,
      nullptr);
  application.configuration_router.initialize(
      application.configuration_control, &receive_telemetry_data,
      &application);
  if (!telemetry_transport.start(&receive_transport_data, &application)) {
    log::error(kTag, "Failed to start telemetry transport");
  }
}

}
