#include "simcore.hpp"

#include "application_configuration.hpp"
#include "board_registry.hpp"
#include "communication_composition.hpp"
#include "configuration_service.hpp"
#include "display.hpp"
#include "event_bus.hpp"
#include "external_memory_buffer.hpp"
#include "font_asset_service.hpp"
#include "logger.hpp"
#include "nvs_config_storage.hpp"
#include "partition_font_asset_storage.hpp"
#include "dashboard_composition.hpp"
#include "module_composition.hpp"
#include "simcore_features.hpp"
#include "telemetry_provider.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"
#include "telemetry_transport_composition.hpp"
#include "esp_err.h"
#if SIMCORE_DEBUG
#include "performance.hpp"
#endif

namespace simcore {
namespace {

constexpr char kTag[] = "simcore";

struct PlatformAdapters {
  configuration::NvsConfigurationStorage configuration_storage;
  font_assets::PartitionStorage font_asset_storage;
  transport::TelemetryComposition telemetry_transport;
  platform::ExternalMemoryBuffer configuration_memory;
};

struct ApplicationServices {
  configuration::ConfigurationService configuration;
  font_assets::Service font_assets;
  events::EventBus event_bus;
  telemetry::TelemetryRegistry telemetry_registry;
  telemetry::TelemetryStateService telemetry_state{telemetry_registry};
  telemetry::TelemetryProvider telemetry_provider{telemetry_state, event_bus};
};

struct Application {
  PlatformAdapters platform;
  ApplicationServices services;
  module_composition::Modules modules;
  communication::Composition communication{services.telemetry_registry};
  dashboard_composition::Dashboard dashboard;
};

}

void run() {
  static Application application;
  constexpr std::size_t kConfigurationMemorySize =
      configuration::ConfigurationService::kRecordBufferSize +
      configuration::ConfigurationService::kPayloadBufferSize +
      configuration::ConfigurationControl::kIoBufferSize +
      communication::Router::kControlLineBufferSize;
  ESP_ERROR_CHECK(application.platform.configuration_memory.initialize(
                      kConfigurationMemorySize)
                      ? ESP_OK
                      : ESP_ERR_NO_MEM);
  std::span<std::uint8_t> configuration_memory =
      application.platform.configuration_memory.bytes();
  const auto take_buffer = [&configuration_memory](const std::size_t size) {
    const std::span<std::uint8_t> buffer = configuration_memory.first(size);
    configuration_memory = configuration_memory.subspan(size);
    return buffer;
  };
  const std::span<std::uint8_t> record_buffer = take_buffer(
      configuration::ConfigurationService::kRecordBufferSize);
  const std::span<std::uint8_t> current_payload_buffer = take_buffer(
      configuration::ConfigurationService::kPayloadBufferSize);
  const std::span<std::uint8_t> control_io_buffer = take_buffer(
      configuration::ConfigurationControl::kIoBufferSize);
  const std::span<std::uint8_t> control_line_buffer = take_buffer(
      communication::Router::kControlLineBufferSize);
  const board_registry::BoardDefinition& board =
      board_registry::factory_board();
  const std::string_view factory_json = board.factory_configuration_json;
  if (!application.services.configuration.initialize(
          application.platform.configuration_storage,
          board.validation,
          std::span<const std::uint8_t>(
              reinterpret_cast<const std::uint8_t*>(factory_json.data()),
              factory_json.size()),
          record_buffer, current_payload_buffer)) {
    log::warn(kTag,
              "Configuration storage unavailable; using factory defaults");
  }
  const configuration::ApplicationConfiguration& configuration =
      application.services.configuration.current();
  if (!application.services.font_assets.initialize(
          application.platform.font_asset_storage)) {
    log::warn(kTag, "Font asset storage unavailable");
  }
  transport::ITransport* telemetry_transport =
      application.platform.telemetry_transport.select(board, configuration);
  ESP_ERROR_CHECK(telemetry_transport == nullptr ? ESP_ERR_NOT_SUPPORTED
                                                 : ESP_OK);

  log::info(kTag, "SimCore starting");
#if SIMCORE_DEBUG
  performance::begin();
#endif
  lv_display_t* display = display::initialize(board.display);
  if (!dashboard_composition::show_startup_screen(display, configuration)) {
    log::warn(kTag, "Startup screen is unavailable for this display");
  }
  if (!module_composition::start(
          application.modules, application.services.event_bus,
          application.services.telemetry_registry,
          application.services.telemetry_state,
          configuration)) {
    log::error(kTag, "One or more configured modules failed to start");
  }
  if (!dashboard_composition::create(
          display, configuration, application.modules, application.dashboard,
          application.services.font_assets,
          application.services.telemetry_registry,
          application.services.telemetry_state,
          *telemetry_transport)) {
    log::error(kTag, "Dashboard composition is incomplete");
  }
  if (!application.communication.start(
          application.services.configuration,
          application.services.font_assets,
          application.services.telemetry_provider, *telemetry_transport,
          control_io_buffer, control_line_buffer)) {
    log::error(kTag, "Communication composition is incomplete");
  }
}

}
