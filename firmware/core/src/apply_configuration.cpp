#include "application.hpp"

#include <cstddef>
#include <span>

#include "application_configuration.hpp"
#include "board_registry.hpp"
#include "configuration_service.hpp"
#include "dashboard_composition.hpp"
#include "image_asset_service.hpp"
#include "logger.hpp"
#include "module_composition.hpp"

namespace simcore {
namespace {

constexpr char kTag[] = "simcore";

}

transport::ITransport& primary_transport(Application& application) {
  return *application.telemetry_transports[0];
}

namespace {

bool restart_modules(Application& application) {
  return module_composition::start(
      application.modules, application.services.event_bus,
      application.services.telemetry_registry,
      application.services.telemetry_state,
      board_registry::factory_board().led,
      application.services.configuration.current());
}

bool create_dashboard(Application& application) {
  const configuration::ApplicationConfiguration& configuration =
      application.services.configuration.current();
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
  return dashboard_composition::create(
      application.display, configuration, application.modules,
      dashboard_composition::instance(), application.services.telemetry_registry,
      application.services.telemetry_state, primary_transport(application));
}

configuration::ValidationFailure apply_modules_document(
    Application& application, configuration::ConfigurationService& service) {
  if (restart_modules(application)) {
    return {};
  }
  log::error(kTag, "Applying peripherals failed; restoring the previous ones");
  service.revert();
  (void)restart_modules(application);
  return {.error = configuration::ValidationError::invalid_hardware};
}

configuration::ValidationFailure apply_dashboard_document(
    Application& application, configuration::ConfigurationService& service,
    const configuration::ApplicationConfiguration& previous,
    const configuration::ApplicationConfiguration& candidate) {
  if (application.display == nullptr) {
    return {};
  }
  const bool modules_change = module_composition::lap_timer_used(previous) !=
                              module_composition::lap_timer_used(candidate);
  if (!modules_change &&
      dashboard_composition::images_loaded(candidate,
                                           dashboard_composition::instance()) &&
      dashboard_composition::apply_incremental(previous, candidate,
                                               dashboard_composition::instance())) {
    dashboard_composition::dismiss_startup_screen(candidate, false);
    return {};
  }
  dashboard_composition::destroy(dashboard_composition::instance());
  const bool modules_started =
      !modules_change || restart_modules(application);
  if (create_dashboard(application) && modules_started) {
    dashboard_composition::dismiss_startup_screen(service.current(), false);
    return {};
  }
  log::error(kTag, "Applying configuration failed; restoring the previous one");
  service.revert();
  dashboard_composition::destroy(dashboard_composition::instance());
  if (modules_change) {
    (void)restart_modules(application);
  }
  (void)create_dashboard(application);
  return {.error = configuration::ValidationError::invalid_dashboard};
}

}

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

  switch (document) {
    case configuration::ConfigurationDocument::protocol:
      return {};
    case configuration::ConfigurationDocument::modules:
      return apply_modules_document(application, service);
    case configuration::ConfigurationDocument::dashboard:
      return apply_dashboard_document(application, service, previous, candidate);
  }
  return {};
}

}
