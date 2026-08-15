#include "simcore.hpp"

#include <cstring>
#include <span>

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
  lv_display_t* display{};
  transport::ITransport* telemetry_transport{};
};

// Rebuilds module lifecycle and the dashboard from the active configuration.
bool recompose(Application& application) {
  const configuration::ApplicationConfiguration& configuration =
      application.services.configuration.current();
  // Widgets read module state, so the dashboard goes away before modules are
  // restarted and is built again afterwards.
  dashboard_composition::destroy(application.dashboard);
  const bool modules_started = module_composition::start(
      application.modules, application.services.event_bus,
      application.services.telemetry_registry,
      application.services.telemetry_state, configuration);
  const bool dashboard_created = dashboard_composition::create(
      application.display, configuration, application.modules,
      application.dashboard, application.services.font_assets,
      application.services.telemetry_registry,
      application.services.telemetry_state,
      *application.telemetry_transport);
  return modules_started && dashboard_created;
}

// Applies a replacement to the running composition. Runs on the configuration
// control task, which may take the LVGL lock.
//
// The order is the one ADR 0016 requires: stage into the inactive document,
// establish that it can actually be composed, promote, then recompose. Font
// availability is checked before anything is torn down, because font assets are
// installed once per boot and a rejected replacement must leave the running
// dashboard alone.
configuration::ValidationFailure apply_configuration(
    const std::span<const std::uint8_t> payload, void* const context) {
  auto& application = *static_cast<Application*>(context);
  configuration::ConfigurationService& service =
      application.services.configuration;

  const configuration::ValidationFailure staged = service.stage(payload);
  if (!staged.ok()) {
    return staged;
  }
  if (!dashboard_composition::fonts_available(service.staged(),
                                              application.dashboard.fonts)) {
    return {.error = configuration::ValidationError::invalid_widget,
            .path = {'f', 'o', 'n', 't', '\0'}};
  }

  // Anything outside the dashboard changes module lifecycle or transport, so
  // only a dashboard-local difference can take the incremental path.
  const configuration::ApplicationConfiguration& previous = service.current();
  const configuration::ApplicationConfiguration& candidate = service.staged();
  const bool dashboard_only =
      previous.delta_time_present == candidate.delta_time_present &&
      std::memcmp(&previous.delta_time, &candidate.delta_time,
                  sizeof(previous.delta_time)) == 0 &&
      previous.telemetry_transport_present ==
          candidate.telemetry_transport_present &&
      std::memcmp(&previous.telemetry_transport,
                  &candidate.telemetry_transport,
                  sizeof(previous.telemetry_transport)) == 0;

  service.promote();
  if (dashboard_only &&
      dashboard_composition::apply_incremental(previous, candidate,
                                               application.dashboard)) {
    return {};
  }
  if (recompose(application)) {
    return {};
  }

  // Composition failed on the new document. Put the previous one back and
  // rebuild from it so the device is never left with a broken dashboard.
  log::error(kTag, "Applying configuration failed; restoring the previous one");
  service.revert();
  (void)recompose(application);
  return {.error = configuration::ValidationError::invalid_dashboard};
}

}

void run() {
  static Application application;
  constexpr std::size_t kConfigurationMemorySize =
      configuration::ConfigurationService::kRecordBufferSize +
      configuration::ConfigurationService::kPayloadBufferSize +
      configuration::ConfigurationService::kConfigurationBufferSize +
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
  // The two bounded runtime documents live in external memory with the rest of
  // the configuration workspaces, keeping ~8.5 KiB off the internal heap.
  const std::span<std::uint8_t> configuration_buffer = take_buffer(
      configuration::ConfigurationService::kConfigurationBufferSize);
  const board_registry::BoardDefinition& board =
      board_registry::factory_board();
  const std::string_view factory_json = board.factory_configuration_json;
  if (!application.services.configuration.initialize(
          application.platform.configuration_storage,
          board.validation,
          std::span<const std::uint8_t>(
              reinterpret_cast<const std::uint8_t*>(factory_json.data()),
              factory_json.size()),
          record_buffer, current_payload_buffer, configuration_buffer)) {
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
  application.telemetry_transport = telemetry_transport;
  lv_display_t* display = display::initialize(board.display);
  application.display = display;
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
  if (!dashboard_composition::start_render_trigger(
          application.dashboard, application.services.event_bus)) {
    log::error(kTag,
               "Render trigger is unavailable; widgets fall back to "
               "periodic polling");
  }
  if (!application.communication.start(
          application.services.configuration,
          application.services.font_assets,
          application.services.telemetry_provider, *telemetry_transport,
          &apply_configuration, &application, control_io_buffer,
          control_line_buffer)) {
    log::error(kTag, "Communication composition is incomplete");
  }
}

}
