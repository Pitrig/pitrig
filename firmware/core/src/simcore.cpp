#include "simcore.hpp"

// Ahead of everything else: the feature macros below gate includes, and a
// second-link build that reads them before they are defined silently takes the
// single-link branch.
#include "simcore_features.hpp"

#include <cstring>
#include <span>
#if SIMCORE_SECOND_TELEMETRY_LINK
#include <array>
#endif

#include "application_configuration.hpp"
#include "board_registry.hpp"
#include "communication_composition.hpp"
#include "configuration_service.hpp"
#include "dashboard_composition.hpp"
#include "display.hpp"
#include "esp_err.h"
#include "event_bus.hpp"
#include "external_memory_buffer.hpp"
#include "font_asset_service.hpp"
#include "image_asset_service.hpp"
#include "input.hpp"
#include "logger.hpp"
#include "module_composition.hpp"
#include "nvs_config_storage.hpp"
#include "partition_asset_storage.hpp"
#include "telemetry_provider.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"
#include "telemetry_transport_composition.hpp"
#if SIMCORE_DEBUG
#include "performance.hpp"
#endif

namespace simcore {
namespace {

constexpr char kTag[] = "simcore";

struct PlatformAdapters {
  configuration::NvsConfigurationStorage configuration_storage;
  platform::PartitionStorage font_asset_storage{"font_assets",
                                                font_assets::kStorageSize};
  platform::PartitionStorage image_asset_storage{"image_assets",
                                                 image_assets::kStorageSize};
  transport::TelemetryComposition telemetry_transport;
  platform::ExternalMemoryBuffer configuration_memory;
  platform::ExternalMemoryBuffer font_memory;
  platform::ExternalMemoryBuffer image_memory;
};

struct ApplicationServices {
  configuration::ConfigurationService configuration;
  font_assets::Service font_assets;
  image_assets::Service image_assets;
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
#if SIMCORE_SECOND_TELEMETRY_LINK
  // In priority order: the board's configured transport, then the development
  // link attached behind it.
  std::array<transport::ITransport*,
             communication::Composition::kMaximumLinks>
      telemetry_transports{};
  std::size_t telemetry_link_count{};
#else
  transport::ITransport* telemetry_transport{};
#endif
};

// The overlay reads transport diagnostics from the board's own link.
transport::ITransport& primary_transport(Application& application) {
#if SIMCORE_SECOND_TELEMETRY_LINK
  return *application.telemetry_transports[0];
#else
  return *application.telemetry_transport;
#endif
}

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
      application.dashboard, application.services.telemetry_registry,
      application.services.telemetry_state, primary_transport(application));
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
  if (!dashboard_composition::images_available(service.staged(),
                                               application.dashboard.images)) {
    return {.error = configuration::ValidationError::invalid_widget,
            .path = {'i', 'm', 'a', 'g', 'e', '\0'}};
  }

  // Anything outside the dashboard changes module lifecycle or transport, so
  // only a dashboard-local difference can take the incremental path.
  const configuration::ApplicationConfiguration& previous = service.current();
  const configuration::ApplicationConfiguration& candidate = service.staged();
  const bool dashboard_only =
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

// The workspaces the configuration path needs, all carved from one external
// memory reservation so ~8.5 KiB of bounded documents and line buffers stay off
// the internal heap.
struct ConfigurationBuffers {
  std::span<std::uint8_t> record;
  std::span<std::uint8_t> current_payload;
  std::span<std::uint8_t> control_io;
  std::span<std::uint8_t> control_line;
  std::span<std::uint8_t> configuration;
};

ConfigurationBuffers reserve_configuration_memory(Application& application) {
  constexpr std::size_t kConfigurationMemorySize =
      configuration::ConfigurationService::kRecordBufferSize +
      configuration::ConfigurationService::kPayloadBufferSize +
      configuration::ConfigurationService::kConfigurationBufferSize +
      configuration::ConfigurationControl::kIoBufferSize +
      communication::Composition::kMaximumLinks *
          communication::Router::kControlLineBufferSize;
  ESP_ERROR_CHECK(application.platform.configuration_memory.initialize(
                      kConfigurationMemorySize)
                      ? ESP_OK
                      : ESP_ERR_NO_MEM);
  std::span<std::uint8_t> memory =
      application.platform.configuration_memory.bytes();
  const auto take = [&memory](const std::size_t size) {
    const std::span<std::uint8_t> buffer = memory.first(size);
    memory = memory.subspan(size);
    return buffer;
  };
  return {
      .record = take(configuration::ConfigurationService::kRecordBufferSize),
      .current_payload =
          take(configuration::ConfigurationService::kPayloadBufferSize),
      .control_io = take(configuration::ConfigurationControl::kIoBufferSize),
      .control_line = take(communication::Composition::kMaximumLinks *
                           communication::Router::kControlLineBufferSize),
      .configuration =
          take(configuration::ConfigurationService::kConfigurationBufferSize),
  };
}

void load_configuration(Application& application,
                        const board_registry::BoardDefinition& board,
                        const ConfigurationBuffers& buffers) {
  const std::string_view factory_json = board.factory_configuration_json;
  if (!application.services.configuration.initialize(
          application.platform.configuration_storage, board.validation,
          std::span<const std::uint8_t>(
              reinterpret_cast<const std::uint8_t*>(factory_json.data()),
              factory_json.size()),
          buffers.record, buffers.current_payload, buffers.configuration)) {
    log::warn(kTag,
              "Configuration storage unavailable; using factory defaults");
  }
  if (!application.services.font_assets.initialize(
          application.platform.font_asset_storage)) {
    log::warn(kTag, "Font asset storage unavailable");
  }
  if (!application.services.image_assets.initialize(
          application.platform.image_asset_storage)) {
    log::warn(kTag, "Image asset storage unavailable");
  }
}

void initialize_display(Application& application,
                        const board_registry::BoardDefinition& board,
                        const configuration::ApplicationConfiguration&
                            configuration) {
  application.display = display::initialize(board.display);
  // A board without a digitizer leaves this null. The pointer device is never
  // torn down, so nothing else in the firmware learns which case it is in, and
  // a declared panel that fails to answer lands in the same place.
  if (board.input != nullptr &&
      input::initialize(*board.input, application.display) == nullptr) {
    log::warn(kTag, "Touch input unavailable; running without a pointer");
  }
  if (!dashboard_composition::show_startup_screen(application.display,
                                                  configuration)) {
    log::warn(kTag, "Startup screen is unavailable for this display");
  }
}

// Fonts and images are both copied out of the package mapping a later upload
// releases: a widget drawing from that mapping would be reading a partition
// mid-erase. The cost is bounded by what was actually uploaded rather than by
// the partition. A failure here is not fatal — composition reports it as an
// unresolved dependency.
void load_uploaded_assets(Application& application) {
  const std::size_t face_bytes =
      application.services.font_assets.face_bytes_total();
  if (face_bytes > 0) {
    if (!application.platform.font_memory.initialize(face_bytes)) {
      log::error(kTag, "Font faces do not fit in external memory");
    } else if (!dashboard_composition::load_fonts(
                   application.dashboard, application.services.font_assets,
                   application.platform.font_memory.bytes())) {
      log::error(kTag, "Font faces could not be loaded");
    }
  }
  const std::size_t image_bytes =
      application.services.image_assets.image_bytes_total();
  if (image_bytes > 0) {
    if (!application.platform.image_memory.initialize(image_bytes)) {
      log::error(kTag, "Images do not fit in external memory");
    } else if (!dashboard_composition::load_images(
                   application.dashboard, application.services.image_assets,
                   application.platform.image_memory.bytes())) {
      log::error(kTag, "Images could not be loaded");
    }
  }
}

void compose(Application& application,
             const configuration::ApplicationConfiguration& configuration) {
  if (!module_composition::start(application.modules,
                                 application.services.event_bus,
                                 application.services.telemetry_registry,
                                 application.services.telemetry_state,
                                 configuration)) {
    log::error(kTag, "One or more configured modules failed to start");
  }
  if (!dashboard_composition::create(
          application.display, configuration, application.modules,
          application.dashboard, application.services.telemetry_registry,
          application.services.telemetry_state,
          primary_transport(application))) {
    log::error(kTag, "Dashboard composition is incomplete");
  }
  if (!dashboard_composition::start_render_trigger(
          application.dashboard, application.services.event_bus)) {
    log::error(kTag,
               "Render trigger is unavailable; widgets fall back to "
               "periodic polling");
  }
}

void start_communication(Application& application,
                         const ConfigurationBuffers& buffers) {
  if (!application.communication.start(
          application.services.configuration,
          application.services.font_assets, application.services.image_assets,
          application.services.telemetry_provider,
#if SIMCORE_SECOND_TELEMETRY_LINK
          std::span<transport::ITransport* const>(
              application.telemetry_transports.data(),
              application.telemetry_link_count),
#else
          *application.telemetry_transport,
#endif
          &apply_configuration, &application, buffers.control_io,
          buffers.control_line)) {
    log::error(kTag, "Communication composition is incomplete");
  }
}

}  // namespace

void run() {
  static Application application;
  const ConfigurationBuffers buffers =
      reserve_configuration_memory(application);
  const board_registry::BoardDefinition& board =
      board_registry::factory_board();
  load_configuration(application, board, buffers);

  const configuration::ApplicationConfiguration& configuration =
      application.services.configuration.current();
#if SIMCORE_SECOND_TELEMETRY_LINK
  application.telemetry_link_count =
      application.platform.telemetry_transport.select(
          board, configuration, application.telemetry_transports);
  ESP_ERROR_CHECK(application.telemetry_link_count == 0 ? ESP_ERR_NOT_SUPPORTED
                                                        : ESP_OK);
#else
  application.telemetry_transport =
      application.platform.telemetry_transport.select(board, configuration);
  ESP_ERROR_CHECK(application.telemetry_transport == nullptr
                      ? ESP_ERR_NOT_SUPPORTED
                      : ESP_OK);
#endif

  log::info(kTag, "SimCore starting");
#if SIMCORE_DEBUG
  performance::begin();
#endif
  initialize_display(application, board, configuration);
  load_uploaded_assets(application);
  compose(application, configuration);
  start_communication(application, buffers);
}

}
