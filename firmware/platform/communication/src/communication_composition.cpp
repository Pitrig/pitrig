#include "communication_composition.hpp"

#include <array>

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

#if SIMCORE_SECOND_TELEMETRY_LINK

Composition::Composition(const telemetry::ITelemetryRegistry& registry)
    : links_{Link{registry}, Link{registry}} {}

#else

Composition::Composition(const telemetry::ITelemetryRegistry& registry)
    : protocol_(registry) {}

#endif

Composition::~Composition() { stop(); }

#if SIMCORE_SECOND_TELEMETRY_LINK

bool Composition::start(
    configuration::ConfigurationService& configuration,
    font_assets::Service& font_assets,
    image_assets::Service& image_assets,
    telemetry::TelemetryProvider& telemetry,
    const std::span<transport::ITransport* const> transports,
    const configuration::ConfigurationControl::ApplyHandler apply_handler,
    void* const apply_context,
    const std::span<std::uint8_t> control_io_buffer,
    const std::span<std::uint8_t> control_line_buffers) {
  if (started_) {
    log::error(kTag, "Communication is already running");
    return false;
  }
  if (transports.empty() || transports.size() > kMaximumLinks ||
      control_line_buffers.size() <
          transports.size() * Router::kControlLineBufferSize) {
    log::error(kTag, "Communication was given no usable link");
    return false;
  }
  for (std::size_t index = 0; index < transports.size(); ++index) {
    if (transports[index] == nullptr || !links_[index].protocol.initialized()) {
      log::error(kTag, "Failed to bind telemetry protocol fields");
      return false;
    }
  }
  // The control services answer per request, but they still need one link to
  // fall back on for a reply with no request behind it, such as an upload
  // timing out. The first is the board's own configured transport.
  if (!configuration_control_.initialize(configuration, *transports[0], &reboot,
                                         nullptr, apply_handler, apply_context,
                                         control_io_buffer)) {
    log::error(kTag, "Failed to start configuration control task");
    return false;
  }
  if (!font_asset_control_.initialize(font_assets, *transports[0],
                                      binary_claim_)) {
    log::error(kTag, "Failed to start font asset control task");
    configuration_control_.stop();
    return false;
  }
  if (!image_asset_control_.initialize(image_assets, *transports[0],
                                       binary_claim_)) {
    log::error(kTag, "Failed to start image asset control task");
    font_asset_control_.stop();
    configuration_control_.stop();
    return false;
  }
  const std::array<const binary_session::Session*, 2> sessions{
      &font_asset_control_.session(), &image_asset_control_.session()};

  telemetry_ = &telemetry;
  link_count_ = transports.size();
  for (std::size_t index = 0; index < link_count_; ++index) {
    Link& link = links_[index];
    link.owner = this;
    link.transport = transports[index];
    link.router.initialize(
        configuration_control_, binary_claim_, sessions,
        &receive_telemetry_data, &link,
        control_line_buffers.subspan(index * Router::kControlLineBufferSize,
                                     Router::kControlLineBufferSize),
        *link.transport);
  }
  for (std::size_t index = 0; index < link_count_; ++index) {
    if (links_[index].transport->start(&receive_transport_data,
                                       &links_[index])) {
      continue;
    }
    // A link that will not start takes the whole composition with it rather
    // than leaving the device answering on some of the ports it was asked for.
    log::error(kTag, "Failed to start telemetry transport");
    for (std::size_t started = 0; started < index; ++started) {
      links_[started].transport->stop();
    }
    stop();
    return false;
  }
  started_ = true;
  return true;
}

void Composition::stop() {
  for (std::size_t index = 0; index < link_count_; ++index) {
    Link& link = links_[index];
    if (started_ && link.transport != nullptr) {
      link.transport->stop();
    }
    link.router.reset();
    link.transport = nullptr;
    link.owner = nullptr;
  }
  link_count_ = 0;
  image_asset_control_.stop();
  font_asset_control_.stop();
  configuration_control_.stop();
  telemetry_ = nullptr;
  started_ = false;
}

#else

bool Composition::start(
    configuration::ConfigurationService& configuration,
    font_assets::Service& font_assets,
    image_assets::Service& image_assets,
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
  if (!font_asset_control_.initialize(font_assets, transport, binary_claim_)) {
    log::error(kTag, "Failed to start font asset control task");
    configuration_control_.stop();
    return false;
  }
  if (!image_asset_control_.initialize(image_assets, transport, binary_claim_)) {
    log::error(kTag, "Failed to start image asset control task");
    font_asset_control_.stop();
    configuration_control_.stop();
    return false;
  }
  const std::array<const binary_session::Session*, 2> sessions{
      &font_asset_control_.session(), &image_asset_control_.session()};
  router_.initialize(configuration_control_, binary_claim_, sessions,
                     &receive_telemetry_data, this, control_line_buffer);
  telemetry_ = &telemetry;
  if (!transport.start(&receive_transport_data, this)) {
    log::error(kTag, "Failed to start telemetry transport");
    router_.reset();
    image_asset_control_.stop();
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
  image_asset_control_.stop();
  font_asset_control_.stop();
  configuration_control_.stop();
  telemetry_ = nullptr;
  transport_ = nullptr;
  started_ = false;
}

#endif

void Composition::submit_update(const telemetry::TelemetryUpdate& update,
                                void* const context) {
  auto& composition = *static_cast<Composition*>(context);
  if (composition.telemetry_ != nullptr) {
    composition.telemetry_->submit(update);
  }
}

#if SIMCORE_SECOND_TELEMETRY_LINK

void Composition::receive_telemetry_data(
    const std::span<const std::uint8_t> data, void* const context) {
  auto& link = *static_cast<Link*>(context);
  link.protocol.consume(data, &submit_update, link.owner);
}

void Composition::receive_transport_data(
    const std::span<const std::uint8_t> data, void* const context) {
  static_cast<Link*>(context)->router.consume(data);
}

#else

void Composition::receive_telemetry_data(
    const std::span<const std::uint8_t> data, void* const context) {
  auto& composition = *static_cast<Composition*>(context);
  composition.protocol_.consume(data, &submit_update, &composition);
}

void Composition::receive_transport_data(
    const std::span<const std::uint8_t> data, void* const context) {
  static_cast<Composition*>(context)->router_.consume(data);
}

#endif

void Composition::reboot(void*) {
  vTaskDelay(pdMS_TO_TICKS(100));
  esp_restart();
}

}  // namespace simcore::communication
