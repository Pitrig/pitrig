#include "communication_composition.hpp"

#include <array>

#include "configuration_service.hpp"
#include "esp_system.h"
#include "firmware_update_service.hpp"
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
#if SIMCORE_SECOND_TELEMETRY_LINK
    : links_{Link{registry}, Link{registry}} {}
#else
    : links_{Link{registry}} {}
#endif

Composition::~Composition() { stop(); }

bool Composition::start(
    configuration::ConfigurationService& configuration,
    firmware_update::Service& firmware_update,
    font_assets::Service& font_assets,
    image_assets::Service& image_assets,
    telemetry::TelemetryProvider& telemetry,
    const std::span<transport::ITransport* const> transports,
    const configuration::ConfigurationControl::ApplyHandler apply_handler,
    void* const apply_context,
    const std::span<std::uint8_t> control_io_buffer,
    const std::span<std::uint8_t> control_line_buffers,
    const Surface surface) {
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
  const bool full = surface == Surface::full;
  for (std::size_t index = 0; index < transports.size(); ++index) {
    // The protocol binding only has to hold where telemetry is decoded. A
    // recovery link never reaches it, and refusing to come up over a registry
    // it will not read would cost the board the only way back.
    if (transports[index] == nullptr ||
        (full && !links_[index].protocol.initialized())) {
      log::error(kTag, "Failed to bind telemetry protocol fields");
      return false;
    }
  }
  // The control services answer on the link each request arrived on, so they
  // are given no link of their own: the router hands them one with every line.
  // Even a reply with no request behind it, such as an upload timing out, goes
  // to the link that opened the upload.
  if (!configuration_control_.initialize(configuration, &reboot, nullptr,
                                         apply_handler, apply_context,
                                         control_io_buffer)) {
    log::error(kTag, "Failed to start configuration control task");
    return false;
  }
  if (full && !font_asset_control_.initialize(font_assets, binary_claim_)) {
    log::error(kTag, "Failed to start font asset control task");
    configuration_control_.stop();
    return false;
  }
  if (full && !image_asset_control_.initialize(image_assets, binary_claim_)) {
    log::error(kTag, "Failed to start image asset control task");
    font_asset_control_.stop();
    configuration_control_.stop();
    return false;
  }
  if (!firmware_update_control_.initialize(firmware_update, binary_claim_)) {
    log::error(kTag, "Failed to start firmware update task");
    image_asset_control_.stop();
    font_asset_control_.stop();
    configuration_control_.stop();
    return false;
  }
  // A session the surface left out is registered as absent rather than as
  // itself: an uninitialized session carries an empty command prefix, and an
  // empty prefix matches every control line there is. The router skips a null
  // entry, so the command falls through to the control service and is answered
  // `unknown_command`.
  const std::array<const binary_session::Session*, 3> sessions{
      full ? &font_asset_control_.session() : nullptr,
      full ? &image_asset_control_.session() : nullptr,
      &firmware_update_control_.session()};

  telemetry_ = full ? &telemetry : nullptr;
  link_count_ = transports.size();
  for (std::size_t index = 0; index < link_count_; ++index) {
    Link& link = links_[index];
    link.owner = this;
    link.transport = transports[index];
    // No telemetry handler on a recovery link: the router drops every line that
    // is not a control line rather than decoding into state nothing reads.
    link.router.initialize(
        configuration_control_, binary_claim_, sessions,
        full ? &receive_telemetry_line : nullptr, &link,
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
  if (!full) {
    // Nothing further is coming on this boot, so neither a write nor an upload
    // has anything left to wait for. Held shut, every SET a host sent to repair
    // the board would sit out the timeout and be refused, and the firmware
    // upload that is the other way out would be answered busy forever.
    mark_composed();
  }
  return true;
}

void Composition::mark_composed() {
  configuration_control_.mark_composed();
  // Startup has finished reading the font and image partitions, so an upload
  // may now erase them.
  binary_claim_.open();
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
  firmware_update_control_.stop();
  image_asset_control_.stop();
  font_asset_control_.stop();
  configuration_control_.stop();
  telemetry_ = nullptr;
  started_ = false;
}

void Composition::submit_update(const telemetry::TelemetryUpdate& update,
                                void* const context) {
  auto& composition = *static_cast<Composition*>(context);
  if (composition.telemetry_ != nullptr) {
    composition.telemetry_->submit(update);
  }
}

void Composition::receive_telemetry_line(
    const std::span<const std::uint8_t> line, void* const context) {
  auto& link = *static_cast<Link*>(context);
  link.protocol.consume_line(line, &submit_update, link.owner);
}

void Composition::receive_transport_data(
    const std::span<const std::uint8_t> data, void* const context) {
  static_cast<Link*>(context)->router.consume(data);
}

void Composition::reboot(void*) {
  vTaskDelay(pdMS_TO_TICKS(100));
  esp_restart();
}

}  // namespace simcore::communication
