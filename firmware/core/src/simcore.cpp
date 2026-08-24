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
  if (application.display == nullptr) {
    log::error(kTag, "Display did not come up; running without a dashboard");
    return;
  }
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
  const bool recovery = boot_guard::safe_mode();
  if (!application.communication.start(
          application.services.configuration,
          application.services.firmware_update,
          application.services.font_assets, application.services.image_assets,
          application.services.telemetry_provider,
          std::span<transport::ITransport* const>(
              application.telemetry_transports.data(),
              application.telemetry_link_count),
          // A recovery boot composes nothing, and the replacement transaction
          // checks a candidate against fonts and images that were never
          // loaded, so it would refuse every dashboard put to it. With no
          // handler the control service answers `unsupported`, and the way out
          // is the SET the configurator pairs with a restart anyway.
          recovery ? nullptr : &apply_configuration, &application,
          buffers.control_io, buffers.control_line,
          recovery ? communication::Composition::Surface::recovery
                   : communication::Composition::Surface::full)) {
    log::error(kTag, "Communication composition is incomplete");
    return false;
  }
  return true;
}

}  // namespace

void run() {
  // Before anything else, because everything after it depends on the answer:
  // whether the last few boots ended in a crash, and therefore whether this one
  // may run the whole firmware or only the link back to a host.
  boot_guard::begin();
  // Each phase is recorded as it is entered, not as it is left, so a boot that
  // does not survive one leaves the name of the phase that killed it.
  boot_guard::reached(boot_guard::Phase::configuration);
  static Application application;
  const ConfigurationBuffers buffers =
      boot::reserve_configuration_memory(application);
  const board_registry::BoardDefinition& board =
      board_registry::factory_board();
  // The configuration still comes first, because the protocol document is what
  // chooses the port, the pins and the baud rate. It is a few NVS reads and no
  // hardware, which is what makes it cheap enough to keep ahead of the link.
  boot::load_configuration(application, board, buffers);

  const configuration::ApplicationConfiguration& configuration =
      application.services.configuration.current();
  application.telemetry_link_count =
      application.platform.telemetry_transport.select(
          board, configuration, application.telemetry_transports);
  if (application.telemetry_link_count == 0) {
    // Deliberately not fatal. Aborting here would reboot, and rebooting would
    // abort again: a build whose board cannot supply the selected transport
    // does not become able to on the next try. Stopping leaves the console
    // readable and leaves a freshly installed image unverified, so the
    // bootloader takes it back on the next reset.
    log::error(kTag, "No telemetry transport for this board; stopping");
    return;
  }

  log::info(kTag, "SimCore starting");
#if SIMCORE_DEBUG
  performance::begin();
#endif
  // The link goes up before the display and before anything is composed. It is
  // the one part of the firmware whose absence cannot be diagnosed or repaired
  // from anywhere else, so it is also the part that must not depend on the rest
  // having worked.
  boot_guard::reached(boot_guard::Phase::link);
  if (!start_communication(application, board, buffers)) {
    return;
  }
  // The one number this ordering exists to change, logged in every build: how
  // long after a reset the board can be talked to. It used to be however long
  // the display, the assets and the whole composition took.
  log::info(kTag, "Serial link answering %lu ms after reset",
            static_cast<unsigned long>(esp_timer_get_time() / 1'000));
  // What a firmware image has to prove is that it can be talked to. Everything
  // past this point is repairable over the link that just came up — a broken
  // dashboard by replacing it, a broken image by uploading another — while an
  // image that cannot reach this line is repairable only by the bootloader
  // taking it back on the next reset.
  application.services.firmware_update.mark_running_image_valid();
  if (boot_guard::safe_mode()) {
    // The link, the control protocol and nothing else. The counter that put
    // this boot here is cleared by the first document a host writes, so the
    // restart after it starts an ordinary boot.
    log::warn(kTag, "Safe mode: waiting for a host on the serial link");
    return;
  }

  boot_guard::reached(boot_guard::Phase::display);
  initialize_display(application, board, configuration);
  boot_guard::reached(boot_guard::Phase::assets);
  boot::open_asset_storage(application);
  load_uploaded_assets(application, configuration);
  boot_guard::reached(boot_guard::Phase::composition);
  compose(application, configuration);
  boot_guard::reached(boot_guard::Phase::complete);
  // Writes have been held since the link came up; there is something to apply
  // them to now.
  application.communication.mark_composed();
  // Only now does the console share its wire, so every line startup logged got
  // out first.
  application.platform.telemetry_transport.silence_logs();
  // Started, not finished: the counter is cleared once the device has run this
  // long without resetting. A fault that only fires when telemetry arrives
  // happens after this line, and has to count.
  boot_guard::arm_stability_window();
}

}
