#include "simcore.hpp"

// Ahead of everything else: the feature macros below gate includes, and reading
// one before it is defined silently takes the wrong branch.
#include "simcore_features.hpp"

#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

#include "application.hpp"
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
                   dashboard_composition::instance(), application.services.font_assets,
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
                   dashboard_composition::instance(), application.services.image_assets,
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
          dashboard_composition::instance(), application.services.telemetry_registry,
          application.services.telemetry_state,
          primary_transport(application))) {
    log::error(kTag, "Dashboard composition is incomplete");
  }
  if (!dashboard_composition::start_render_trigger(
          dashboard_composition::instance(), application.services.event_bus)) {
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
          std::span<transport::ITransport* const>(
              application.telemetry_transports.data(),
              application.telemetry_link_count),
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
  application.telemetry_link_count =
      application.platform.telemetry_transport.select(
          board, configuration, application.telemetry_transports);
  ESP_ERROR_CHECK(application.telemetry_link_count == 0 ? ESP_ERR_NOT_SUPPORTED
                                                        : ESP_OK);

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
