#pragma once

#include <cstdint>
#include <span>

#include "configuration_control.hpp"
#include "communication_router.hpp"
#include "font_asset_control.hpp"
#include "simhub_protocol.hpp"

namespace simcore::configuration {
class ConfigurationService;
}

namespace simcore::font_assets {
class Service;
}

namespace simcore::telemetry {
class TelemetryProvider;
class ITelemetryRegistry;
struct TelemetryUpdate;
}

namespace simcore::transport {
class ITransport;
}

namespace simcore::communication {

// Owns protocol and control-plane routing for one selected transport. The core
// supplies services and a transport but does not depend on a concrete protocol.
class Composition final {
 public:
  explicit Composition(const telemetry::ITelemetryRegistry& registry);
  ~Composition();

  Composition(const Composition&) = delete;
  Composition& operator=(const Composition&) = delete;

  [[nodiscard]] bool start(
      configuration::ConfigurationService& configuration,
      font_assets::Service& font_assets,
      telemetry::TelemetryProvider& telemetry,
      transport::ITransport& transport,
      std::span<std::uint8_t> control_io_buffer,
      std::span<std::uint8_t> control_line_buffer);
  void stop();

 private:
  static void submit_update(const telemetry::TelemetryUpdate& update,
                            void* context);
  static void receive_telemetry_data(
      std::span<const std::uint8_t> data, void* context);
  static void receive_transport_data(
      std::span<const std::uint8_t> data, void* context);
  static void reboot(void* context);

  configuration::ConfigurationControl configuration_control_;
  font_assets::FontAssetControl font_asset_control_;
  Router router_;
  protocols::SimHubProtocol protocol_;
  telemetry::TelemetryProvider* telemetry_{};
  transport::ITransport* transport_{};
  bool started_{};
};

}  // namespace simcore::communication
