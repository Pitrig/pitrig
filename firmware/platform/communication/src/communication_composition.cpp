#include "communication_composition.hpp"

#include "configuration_service.hpp"
#include "esp_system.h"
#include "font_asset_service.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "logger.hpp"
#include "telemetry_provider.hpp"
#include "transport.hpp"

namespace simcore::communication {
namespace {

constexpr char kTag[] = "communication";

}  // namespace

Composition::Composition(const telemetry::ITelemetryRegistry& registry)
    : protocol_(registry) {}

bool Composition::start(
    configuration::ConfigurationService& configuration,
    font_assets::Service& font_assets,
    telemetry::TelemetryProvider& telemetry,
    transport::ITransport& transport) {
  telemetry_ = &telemetry;
  bool started = true;
  if (!configuration_control_.initialize(configuration, transport, &reboot,
                                         nullptr)) {
    log::error(kTag, "Failed to start configuration control task");
    started = false;
  }
  if (!font_asset_control_.initialize(font_assets, transport)) {
    log::error(kTag, "Failed to start font asset control task");
    started = false;
  }
  router_.initialize(configuration_control_, font_asset_control_,
                     &receive_telemetry_data, this);
  if (!protocol_.initialized()) {
    log::error(kTag, "Failed to bind telemetry protocol fields");
    return false;
  }
  if (!transport.start(&receive_transport_data, this)) {
    log::error(kTag, "Failed to start telemetry transport");
    return false;
  }
  return started;
}

void Composition::submit_update(const telemetry::TelemetryUpdate& update,
                                void* const context) {
  auto& composition = *static_cast<Composition*>(context);
  if (composition.telemetry_ != nullptr) {
    composition.telemetry_->submit(update);
  }
}

void Composition::receive_telemetry_data(
    const std::span<const std::uint8_t> data, void* const context) {
  auto& composition = *static_cast<Composition*>(context);
  composition.protocol_.consume(data, &submit_update, &composition);
}

void Composition::receive_transport_data(
    const std::span<const std::uint8_t> data, void* const context) {
  static_cast<Composition*>(context)->router_.consume(data);
}

void Composition::reboot(void*) {
  vTaskDelay(pdMS_TO_TICKS(100));
  esp_restart();
}

}  // namespace simcore::communication
