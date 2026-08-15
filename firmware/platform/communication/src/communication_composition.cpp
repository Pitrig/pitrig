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

Composition::~Composition() { stop(); }

bool Composition::start(
    configuration::ConfigurationService& configuration,
    font_assets::Service& font_assets,
    telemetry::TelemetryProvider& telemetry,
    transport::ITransport& transport,
    const configuration::ConfigurationControl::ApplyHandler apply_handler,
    void* const apply_context,
    const std::span<std::uint8_t> control_io_buffer,
    const std::span<std::uint8_t> control_line_buffer) {
  if (started_ || !protocol_.initialized()) {
    log::error(kTag, started_ ? "Communication is already running"
                              : "Failed to bind telemetry protocol fields");
    return false;
  }
  if (!configuration_control_.initialize(configuration, transport, &reboot,
                                         nullptr, apply_handler, apply_context,
                                         control_io_buffer)) {
    log::error(kTag, "Failed to start configuration control task");
    return false;
  }
  if (!font_asset_control_.initialize(font_assets, transport)) {
    log::error(kTag, "Failed to start font asset control task");
    configuration_control_.stop();
    return false;
  }
  router_.initialize(configuration_control_, font_asset_control_,
                     &receive_telemetry_data, this, control_line_buffer);
  telemetry_ = &telemetry;
  if (!transport.start(&receive_transport_data, this)) {
    log::error(kTag, "Failed to start telemetry transport");
    router_.reset();
    font_asset_control_.stop();
    configuration_control_.stop();
    telemetry_ = nullptr;
    return false;
  }
  transport_ = &transport;
  started_ = true;
  return true;
}

void Composition::stop() {
  if (transport_ != nullptr) {
    transport_->stop();
  }
  router_.reset();
  font_asset_control_.stop();
  configuration_control_.stop();
  telemetry_ = nullptr;
  transport_ = nullptr;
  started_ = false;
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
