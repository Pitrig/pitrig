#include "simcore.hpp"

#include "application_configuration.hpp"
#include "board_registry.hpp"
#include "configuration_control.hpp"
#include "configuration_router.hpp"
#include "configuration_service.hpp"
#include "display.hpp"
#include "event_bus.hpp"
#include "font_asset_service.hpp"
#include "font_asset_control.hpp"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "logger.hpp"
#include "nvs_config_storage.hpp"
#include "partition_font_asset_storage.hpp"
#include "runtime_composition.hpp"
#include "simhub_protocol.hpp"
#include "simcore_features.hpp"
#include "telemetry_provider.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"
#if SIMCORE_DEBUG
#include "performance.hpp"
#endif

namespace simcore {
namespace {

constexpr char kTag[] = "simcore";

struct Application {
  configuration::NvsConfigurationStorage configuration_storage;
  configuration::ConfigurationService configuration_service;
  font_assets::PartitionStorage font_asset_storage;
  font_assets::Service font_asset_service;
  font_assets::FontAssetControl font_asset_control;
  configuration::ConfigurationControl configuration_control;
  configuration::ConfigurationRouter configuration_router;
  events::EventBus event_bus;
  telemetry::TelemetryRegistry telemetry_registry;
  telemetry::TelemetryStateService telemetry_state{telemetry_registry};
  telemetry::TelemetryProvider telemetry_provider{telemetry_state, event_bus};
  protocols::SimHubProtocol protocol{telemetry_registry};
  runtime_composition::Modules modules;
  runtime_composition::Dashboard dashboard;
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
          board_registry::validation_profile(configuration::kFactoryBoard),
          std::span<const std::uint8_t>(
              reinterpret_cast<const std::uint8_t*>(
                  configuration::kFactoryConfigurationJson.data()),
              configuration::kFactoryConfigurationJson.size()))) {
    log::warn(kTag,
              "Configuration storage unavailable; using factory defaults");
  }
  const configuration::ApplicationConfiguration& configuration =
      application.configuration_service.current();
  if (!application.font_asset_service.initialize(
          application.font_asset_storage)) {
    log::warn(kTag, "Font asset storage unavailable");
  }
  transport::ITransport& telemetry_transport =
      board_registry::telemetry_transport(configuration);

  log::info(kTag, "SimCore starting");
#if SIMCORE_DEBUG
  performance::begin();
#endif
  lv_display_t* display =
      display::initialize(board_registry::display_driver(
          configuration::kFactoryBoard));
  if (!runtime_composition::start_modules(
          application.modules, application.event_bus,
          application.telemetry_registry, application.telemetry_state,
          configuration)) {
    log::error(kTag, "One or more configured modules failed to start");
  }
  if (!runtime_composition::create_dashboard(
          display, configuration, application.modules, application.dashboard,
          application.font_asset_service,
          application.telemetry_registry, application.telemetry_state,
          telemetry_transport)) {
    log::error(kTag, "Dashboard composition is incomplete");
  }
  const bool configuration_control_started =
      application.configuration_control.initialize(
          application.configuration_service, telemetry_transport, &reboot,
          nullptr);
  if (!configuration_control_started) {
    log::error(kTag, "Failed to start configuration control task");
  }
  const bool font_asset_control_started =
      application.font_asset_control.initialize(
          application.font_asset_service, telemetry_transport);
  if (!font_asset_control_started) {
    log::error(kTag, "Failed to start font asset control task");
  }
  application.configuration_router.initialize(
      application.configuration_control, application.font_asset_control,
      &receive_telemetry_data, &application);
  if (!application.protocol.initialized()) {
    log::error(kTag, "Failed to bind SimHub protocol fields");
  } else if (!telemetry_transport.start(&receive_transport_data,
                                        &application)) {
    log::error(kTag, "Failed to start telemetry transport");
  }
}

}
