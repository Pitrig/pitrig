#include "pitrig.hpp"

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <span>
#include <string_view>

#include "application.hpp"
#include "application_configuration.hpp"
#include "board_registry.hpp"
#include "boot_guard.hpp"
#include "communication_composition.hpp"
#include "configuration_service.hpp"
#include "dashboard_composition.hpp"
#include "display.hpp"
#include "esp_timer.h"
#include "event_bus.hpp"
#include "external_memory_buffer.hpp"
#include "font_asset_service.hpp"
#include "image_asset_service.hpp"
#include "input.hpp"
#include "logger.hpp"
#include "module_composition.hpp"
#include "nvs_config_storage.hpp"
#include "partition_asset_storage.hpp"
#include "pitrig_boot.hpp"
#include "pitrig_features.hpp"
#include "telemetry_provider.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"
#include "telemetry_transport_composition.hpp"
#if PITRIG_DEBUG
#include "performance.hpp"
#endif

namespace pitrig {
namespace {

constexpr char kTag[] = "pitrig";

void initialize_display(Application& application, const board_registry::BoardDefinition& board,
                        const configuration::ApplicationConfiguration& configuration) {
  if (board.display == nullptr) {
    log::info(kTag, "Board declares no display; running without a dashboard");
    return;
  }
  application.display = display::initialize(*board.display);
  if (application.display == nullptr) {
    log::error(kTag, "Display did not come up; running without a dashboard");
    return;
  }
  if (board.input != nullptr && input::initialize(*board.input, application.display) == nullptr) {
    log::warn(kTag, "Touch input unavailable; running without a pointer");
  }
  if (!dashboard_composition::show_startup_screen(application.display, configuration)) {
    log::warn(kTag, "Startup screen is unavailable for this display");
  }
}

void load_uploaded_assets(Application& application,
                          const configuration::ApplicationConfiguration& configuration) {
  if (application.display == nullptr) {
    return;
  }
  const std::size_t face_bytes = application.services.font_assets.face_bytes_total();
  if (face_bytes > 0) {
    if (!application.platform.font_memory.initialize(face_bytes)) {
      log::error(kTag, "Font faces do not fit in external memory");
    } else if (!dashboard_composition::load_fonts(dashboard_composition::instance(),
                                                  application.services.font_assets,
                                                  application.platform.font_memory.bytes())) {
      log::error(kTag, "Font faces could not be loaded");
    }
  }
  const std::size_t image_bytes =
      dashboard_composition::image_bytes_required(configuration, application.services.image_assets);
  if (image_bytes > 0) {
    if (!application.platform.image_memory.ensure(image_bytes)) {
      log::error(kTag, "Images do not fit in external memory");
    } else if (!dashboard_composition::load_images(dashboard_composition::instance(), configuration,
                                                   application.services.image_assets,
                                                   application.platform.image_memory.bytes())) {
      log::error(kTag, "Images could not be loaded");
    }
  }
}

bool compose(Application& application, const board_registry::BoardDefinition& board,
             const configuration::ApplicationConfiguration& configuration) {
  if (!application.platform.smoothing_memory.initialize(value_smoothing::Service::kStorageBytes) ||
      !application.services.value_smoothing.attach(application.platform.smoothing_memory.bytes())) {
    log::error(kTag, "Value smoothing storage is unavailable");
  }
  if (!module_composition::start(application.modules, application.services.event_bus,
                                 application.services.telemetry_registry,
                                 application.services.telemetry_state, board.led, configuration)) {
    log::error(kTag, "One or more configured modules failed to start");
  }
  if (application.display == nullptr) {
    return false;
  }
  const bool composed = dashboard_composition::create(
      application.display, configuration, application.modules, dashboard_composition::instance(),
      application.services.telemetry_registry, application.services.telemetry_state,
      primary_transport(application), start_value_smoothing(application, configuration));
  if (!composed) {
    log::error(kTag, "Dashboard composition is incomplete");
  }
  if (!dashboard_composition::start_render_trigger(dashboard_composition::instance(),
                                                   application.services.event_bus)) {
    log::error(kTag,
               "Render trigger is unavailable; widgets fall back to "
               "periodic polling");
  }
  return composed;
}

bool select_link(Application& application, const board_registry::BoardDefinition& board) {
  application.telemetry_transport = application.platform.telemetry_transport.select(
      board, application.services.configuration.current());
  if (application.telemetry_transport == nullptr) {
    log::error(kTag, "No telemetry transport for this board");
    return false;
  }
  return true;
}

bool start_communication(Application& application, const ConfigurationBuffers& buffers) {
  const bool recovery = boot_guard::safe_mode();
  if (!application.communication.start(
          application.services.configuration, application.services.firmware_update,
          application.services.font_assets, application.services.image_assets,
          application.services.telemetry_provider, *application.telemetry_transport,
          recovery ? nullptr : &apply_configuration, &application, buffers.control_io,
          buffers.control_line,
          recovery ? communication::Composition::Surface::recovery
                   : communication::Composition::Surface::full)) {
    log::error(kTag, "Communication composition is incomplete");
    return false;
  }
  return true;
}

bool restore_factory_protocol(Application& application,
                              const board_registry::BoardDefinition& board) {
  constexpr auto document = configuration::ConfigurationDocument::protocol;
  const std::string_view json =
      board.factory_configuration_json[static_cast<std::size_t>(document)];
  if (!application.services.configuration
           .stage(document, std::span<const std::uint8_t>(
                                reinterpret_cast<const std::uint8_t*>(json.data()), json.size()))
           .ok()) {
    return false;
  }
  application.services.configuration.promote();
  return true;
}

bool start_link(Application& application, const board_registry::BoardDefinition& board,
                const ConfigurationBuffers& buffers) {
  if (select_link(application, board) && start_communication(application, buffers)) {
    return true;
  }
  if (boot_guard::safe_mode()) {
    return false;
  }
  log::warn(kTag,
            "The stored protocol document did not bring a link up; retrying "
            "with the board's own");
  return restore_factory_protocol(application, board) && select_link(application, board) &&
         start_communication(application, buffers);
}

}

void run() {
  boot_guard::begin();
  boot_guard::reached(boot_guard::Phase::configuration);
  static Application application;
  const ConfigurationBuffers buffers = boot::reserve_configuration_memory(application);
  if (buffers.control_io.empty()) {
    return;
  }
  const board_registry::BoardDefinition& board = board_registry::factory_board();
  boot::load_configuration(application, board, buffers);
  if (!application.services.firmware_update.initialize(board.id)) {
    log::warn(kTag, "No firmware slot to update into");
  }

  log::info(kTag, "Pitrig starting");
#if PITRIG_DEBUG
  performance::begin();
#endif
  boot_guard::reached(boot_guard::Phase::link);
  if (!start_link(application, board, buffers)) {
    if (boot_guard::safe_mode()) {
      log::error(kTag, "Safe mode cannot start a link either; stopping");
      return;
    }
    log::error(kTag, "No serial link; resetting into the recovery surface");
    std::abort();
  }
  log::info(kTag, "Serial link answering %lu ms after reset",
            static_cast<unsigned long>(esp_timer_get_time() / 1'000));
  application.services.firmware_update.mark_running_image_valid();
  if (boot_guard::safe_mode()) {
    log::warn(kTag, "Safe mode: waiting for a host on the serial link");
    return;
  }

  const configuration::ApplicationConfiguration& configuration =
      application.services.configuration.current();
  boot_guard::reached(boot_guard::Phase::display);
  initialize_display(application, board, configuration);
  boot_guard::reached(boot_guard::Phase::assets);
  boot::open_asset_storage(application);
  load_uploaded_assets(application, configuration);
  boot_guard::reached(boot_guard::Phase::composition);
  const bool composed = compose(application, board, configuration);
  boot_guard::reached(boot_guard::Phase::complete);
  if (composed) {
    dashboard_composition::dismiss_startup_screen(configuration, true);
  }
  application.communication.mark_composed();
  application.platform.telemetry_transport.silence_logs();
  boot_guard::arm_stability_window();
}

}
