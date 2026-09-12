#include <cstddef>
#include <span>

#include "application.hpp"
#include "application_configuration.hpp"
#include "configuration_service.hpp"
#include "dashboard_composition.hpp"
#include "image_asset_service.hpp"
#include "logger.hpp"
#include "module_composition.hpp"

namespace pitrig {
namespace {

constexpr char kTag[] = "pitrig";

}

transport::ITransport& primary_transport(Application& application) {
  return *application.telemetry_transport;
}

value_smoothing::Service* start_value_smoothing(
    Application& application, const configuration::ApplicationConfiguration& configuration) {
  value_smoothing::Service& service = application.services.value_smoothing;
  if (!service.start(configuration.dashboard.smoothing)) {
    log::error(kTag, "Value smoothing could not subscribe to telemetry");
  }
  return service.active() ? &service : nullptr;
}

namespace {

bool restart_module(Application& application, const module_composition::Module module) {
  return module_composition::restart(application.modules, module,
                                     application.services.configuration.current());
}

bool create_dashboard(Application& application) {
  const configuration::ApplicationConfiguration& configuration =
      application.services.configuration.current();
  if (application.services.image_assets.package_readable()) {
    const std::size_t image_bytes = dashboard_composition::image_bytes_required(
        configuration, application.services.image_assets);
    if (!application.platform.image_memory.ensure(image_bytes) ||
        !dashboard_composition::load_images(dashboard_composition::instance(), configuration,
                                            application.services.image_assets,
                                            application.platform.image_memory.bytes())) {
      log::error(kTag, "Images could not be loaded for the new configuration");
      return false;
    }
  }
  return dashboard_composition::create(
      application.display, configuration, application.modules, dashboard_composition::instance(),
      application.services.telemetry_registry, application.services.telemetry_state,
      primary_transport(application), start_value_smoothing(application, configuration));
}

configuration::ValidationFailure apply_modules_document(
    Application& application, configuration::ConfigurationService& service) {
  if (restart_module(application, module_composition::Module::rgb_leds)) {
    return {};
  }
  log::error(kTag, "Applying peripherals failed; restoring the previous ones");
  service.revert();
  (void)restart_module(application, module_composition::Module::rgb_leds);
  return {.error = configuration::ValidationError::invalid_hardware};
}

configuration::ValidationFailure apply_dashboard_document(
    Application& application, configuration::ConfigurationService& service,
    const configuration::ApplicationConfiguration& previous,
    const configuration::ApplicationConfiguration& candidate) {
  if (application.display == nullptr) {
    return {};
  }
  const bool modules_change =
      module_composition::lap_timer_used(previous) != module_composition::lap_timer_used(candidate);
  const bool rebinds_all =
      modules_change || previous.dashboard.smoothing != candidate.dashboard.smoothing;
  if (!rebinds_all &&
      dashboard_composition::images_loaded(candidate, dashboard_composition::instance()) &&
      dashboard_composition::apply_incremental(previous, candidate,
                                               dashboard_composition::instance())) {
    dashboard_composition::dismiss_startup_screen(candidate, false);
    return {};
  }
  dashboard_composition::destroy(dashboard_composition::instance());
  const bool modules_started =
      !modules_change || restart_module(application, module_composition::Module::lap_timer);
  if (create_dashboard(application) && modules_started) {
    dashboard_composition::dismiss_startup_screen(service.current(), false);
    return {};
  }
  log::error(kTag, "Applying configuration failed; restoring the previous one");
  service.revert();
  dashboard_composition::destroy(dashboard_composition::instance());
  if (modules_change) {
    (void)restart_module(application, module_composition::Module::lap_timer);
  }
  (void)create_dashboard(application);
  return {.error = configuration::ValidationError::invalid_dashboard};
}

}

configuration::ValidationFailure apply_configuration(
    const configuration::ConfigurationDocument document,
    const std::span<const std::uint8_t> payload, void* const context) {
  auto& application = *static_cast<Application*>(context);
  configuration::ConfigurationService& service = application.services.configuration;

  const configuration::ValidationFailure staged = service.stage(document, payload);
  if (!staged.ok()) {
    return staged;
  }
  if (!dashboard_composition::fonts_available(service.staged(),
                                              dashboard_composition::instance())) {
    return {.error = configuration::ValidationError::invalid_widget,
            .path = {'f', 'o', 'n', 't', '\0'}};
  }
  if (!dashboard_composition::images_available(service.staged(), application.services.image_assets,
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
