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
#include "simcore_boot.hpp"
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

void initialize_display(Application& application,
                        const board_registry::BoardDefinition& board,
                        const configuration::ApplicationConfiguration&
                            configuration) {
  // A board with no panel leaves the display null and takes LVGL with it: the
  // port is never started, so nothing below may take the LVGL lock. Every
  // later phase asks `application.display` rather than the board, because a
  // declared panel that fails to come up has to land in the same place.
  if (board.display == nullptr) {
    log::info(kTag, "Board declares no display; running without a dashboard");
    return;
  }
  application.display = display::initialize(*board.display);
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
// mid-erase. Faces cost what was uploaded; images cost only what this
// configuration draws, since a package may carry up to 32 and a dashboard may
// show at most eight of them. A failure here is not fatal — composition reports
// it as an unresolved dependency.
void load_uploaded_assets(
    Application& application,
    const configuration::ApplicationConfiguration& configuration) {
  // Faces and images are copied out of flash so the dashboard can draw from
  // them. With no dashboard there is nothing to draw, and the copy would only
  // spend external memory the device never reads.
  if (application.display == nullptr) {
    return;
  }
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
  const std::size_t image_bytes = dashboard_composition::image_bytes_required(
      configuration, application.services.image_assets);
  if (image_bytes > 0) {
    if (!application.platform.image_memory.ensure(image_bytes)) {
      log::error(kTag, "Images do not fit in external memory");
    } else if (!dashboard_composition::load_images(
                   dashboard_composition::instance(), configuration,
                   application.services.image_assets,
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
  // Modules run on a board with no panel — they answer telemetry, not pixels.
  // Everything below this point is LVGL.
  if (application.display == nullptr) {
    return;
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

bool start_communication(Application& application,
                         const board_registry::BoardDefinition& board,
                         const ConfigurationBuffers& buffers) {
  // An uploaded image has to name the board it was built for: ESP-IDF refuses
  // an image for another chip, but two of the supported boards are the same
  // chip, and the wrong one of those pair boots with the wrong display driver.
  if (!application.services.firmware_update.initialize(board.id)) {
    log::warn(kTag, "No firmware slot to update into");
  }
  if (!application.communication.start(
          application.services.configuration,
          application.services.firmware_update,
          application.services.font_assets, application.services.image_assets,
          application.services.telemetry_provider,
          std::span<transport::ITransport* const>(
              application.telemetry_transports.data(),
              application.telemetry_link_count),
          &apply_configuration, &application, buffers.control_io,
          buffers.control_line)) {
    log::error(kTag, "Communication composition is incomplete");
    return false;
  }
  return true;
}

}  // namespace

void run() {
  static Application application;
  const ConfigurationBuffers buffers =
      boot::reserve_configuration_memory(application);
  const board_registry::BoardDefinition& board =
      board_registry::factory_board();
  boot::load_configuration(application, board, buffers);

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
  load_uploaded_assets(application, configuration);
  compose(application, configuration);
  if (start_communication(application, board, buffers)) {
    // Everything a firmware image has to prove has now happened: the
    // configuration loaded, the display came up, the dashboard composed and the
    // link answers. A freshly installed image that cannot reach this line is
    // undone by the bootloader on the next reset.
    application.services.firmware_update.mark_running_image_valid();
  }
}

}
