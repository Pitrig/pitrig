#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "binary_session.hpp"
#include "communication_router.hpp"
#include "configuration_control.hpp"
#include "firmware_update_control.hpp"
#include "font_asset_control.hpp"
#include "image_asset_control.hpp"
#include "pitrig_features.hpp"
#include "simhub_protocol.hpp"

namespace pitrig::configuration {
class ConfigurationService;
}

namespace pitrig::font_assets {
class Service;
}

namespace pitrig::image_assets {
class Service;
}

namespace pitrig::telemetry {
class TelemetryProvider;
class ITelemetryRegistry;
struct TelemetryUpdate;
}

namespace pitrig::transport {
class ITransport;
}

namespace pitrig::communication {

class Composition final {
 public:
  explicit Composition(const telemetry::ITelemetryRegistry& registry);
  ~Composition();

  Composition(const Composition&) = delete;
  Composition& operator=(const Composition&) = delete;

  enum class Surface : std::uint8_t { full, recovery };

  [[nodiscard]] bool start(configuration::ConfigurationService& configuration,
                           firmware_update::Service& firmware_update,
                           font_assets::Service& font_assets, image_assets::Service& image_assets,
                           telemetry::TelemetryProvider& telemetry,
                           transport::ITransport& transport,
                           configuration::ConfigurationControl::ApplyHandler apply_handler,
                           void* apply_context, std::span<std::uint8_t> control_io_buffer,
                           std::span<std::uint8_t> control_line_buffer, Surface surface);
  void stop();

  void mark_composed();

 private:
  struct Link {
    explicit Link(const telemetry::ITelemetryRegistry& registry) : protocol(registry) {}

    Composition* owner{};
    transport::ITransport* transport{};
    Router router;
    protocols::SimHubProtocol protocol;
  };

  static void submit_update(const telemetry::TelemetryUpdate& update, void* context);
  static void receive_telemetry_line(std::span<const std::uint8_t> line, void* context);
  static void receive_transport_data(std::span<const std::uint8_t> data, void* context);
  static void reboot(void* context);

  configuration::ConfigurationControl configuration_control_;
  firmware_update::FirmwareUpdateControl firmware_update_control_;
  font_assets::FontAssetControl font_asset_control_;
  image_assets::ImageAssetControl image_asset_control_;
  binary_session::Claim binary_claim_;
  std::array<std::uint8_t, asset_control::kMaximumFrameSize> upload_frame_{};
  Link link_;
  telemetry::TelemetryProvider* telemetry_{};
  bool started_{};
};

}
