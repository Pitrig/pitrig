#include "application.hpp"

#include <cstddef>
#include <span>

#include "application_configuration.hpp"
#include "configuration_service.hpp"
#include "dashboard_composition.hpp"
#include "image_asset_service.hpp"
#include "logger.hpp"
#include "module_composition.hpp"

namespace simcore {
namespace {

// The same tag startup uses: this runs inside the same composition root and
// a reader following a failed replacement is following one device, not two.
constexpr char kTag[] = "simcore";

}  // namespace

transport::ITransport& primary_transport(Application& application) {
  return *application.telemetry_transports[0];
}

// Rebuilds module lifecycle and the dashboard from the active configuration.
bool recompose(Application& application) {
  const configuration::ApplicationConfiguration& configuration =
      application.services.configuration.current();
  // A board with no panel started no LVGL, so there is no dashboard to take
  // down or put back — only the modules the document enables.
  const bool headless = application.display == nullptr;
  // Widgets read module state, so the dashboard goes away before modules are
  // restarted and is built again afterwards.
  if (!headless) {
    dashboard_composition::destroy(dashboard_composition::instance());
  }
  const bool modules_started = module_composition::start(
      application.modules, application.services.event_bus,
      application.services.telemetry_registry,
      application.services.telemetry_state, configuration);
  if (headless) {
    return modules_started;
  }
  // External memory holds the images this document draws rather than every one
  // the package carries, so the set is rebuilt here — with the dashboard down,
  // which is the only moment nothing is drawing from it. The buffer only ever
  // grows, so a document needing less than the last one costs no allocation.
  //
  // Unless there is nothing to rebuild from: between an image upload and the
  // restart it requires, the partition has been erased and the registry holds
  // the only copies left. Reloading then would empty it, so what is there is
  // kept and composed from instead.
  if (application.services.image_assets.package_readable()) {
    const std::size_t image_bytes = dashboard_composition::image_bytes_required(
        configuration, application.services.image_assets);
    if (!application.platform.image_memory.ensure(image_bytes) ||
        !dashboard_composition::load_images(
            dashboard_composition::instance(), configuration,
            application.services.image_assets,
            application.platform.image_memory.bytes())) {
      log::error(kTag, "Images could not be loaded for the new configuration");
      return false;
    }
  }
  const bool dashboard_created = dashboard_composition::create(
      application.display, configuration, application.modules,
      dashboard_composition::instance(), application.services.telemetry_registry,
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
    const configuration::ConfigurationDocument document,
    const std::span<const std::uint8_t> payload, void* const context) {
  auto& application = *static_cast<Application*>(context);
  configuration::ConfigurationService& service =
      application.services.configuration;

  const configuration::ValidationFailure staged =
      service.stage(document, payload);
  if (!staged.ok()) {
    return staged;
  }
  if (!dashboard_composition::fonts_available(service.staged(),
                                              dashboard_composition::instance())) {
    return {.error = configuration::ValidationError::invalid_widget,
            .path = {'f', 'o', 'n', 't', '\0'}};
  }
  if (!dashboard_composition::images_available(service.staged(),
                                               application.services.image_assets,
                                               dashboard_composition::instance())) {
    return {.error = configuration::ValidationError::invalid_widget,
            .path = {'i', 'm', 'a', 'g', 'e', '\0'}};
  }

  const configuration::ApplicationConfiguration& previous = service.current();
  const configuration::ApplicationConfiguration& candidate = service.staged();
  service.promote();

  // Which document arrived is what a replacement costs. The transport is bound
  // once at startup, so the protocol document is stored and nothing is rebuilt
  // from it; a dashboard may be rebuilt in place; anything touching module
  // lifecycle goes through a full recompose.
  if (document == configuration::ConfigurationDocument::protocol) {
    return {};
  }
  // The incremental path rebuilds LVGL objects in place, so it is reachable
  // only where LVGL is running at all — and only while every image the document
  // draws is already loaded, since rebuilding the image table is safe just with
  // the dashboard down.
  if (document == configuration::ConfigurationDocument::dashboard &&
      application.display != nullptr &&
      dashboard_composition::images_loaded(candidate,
                                           dashboard_composition::instance()) &&
      dashboard_composition::apply_incremental(previous, candidate,
                                               dashboard_composition::instance())) {
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

}  // namespace simcore
