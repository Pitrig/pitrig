#include "application.hpp"

#include <cstring>
#include <span>

#include "application_configuration.hpp"
#include "configuration_service.hpp"
#include "dashboard_composition.hpp"
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
  // Widgets read module state, so the dashboard goes away before modules are
  // restarted and is built again afterwards.
  dashboard_composition::destroy(dashboard_composition::instance());
  const bool modules_started = module_composition::start(
      application.modules, application.services.event_bus,
      application.services.telemetry_registry,
      application.services.telemetry_state, configuration);
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
    const std::span<const std::uint8_t> payload, void* const context) {
  auto& application = *static_cast<Application*>(context);
  configuration::ConfigurationService& service =
      application.services.configuration;

  const configuration::ValidationFailure staged = service.stage(payload);
  if (!staged.ok()) {
    return staged;
  }
  if (!dashboard_composition::fonts_available(service.staged(),
                                              dashboard_composition::instance())) {
    return {.error = configuration::ValidationError::invalid_widget,
            .path = {'f', 'o', 'n', 't', '\0'}};
  }
  if (!dashboard_composition::images_available(service.staged(),
                                               dashboard_composition::instance())) {
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
