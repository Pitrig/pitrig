#pragma once

#include <cstdint>
#include <span>

#include "configuration_control.hpp"
#include "communication_router.hpp"
#include "binary_session.hpp"
#include "firmware_update_control.hpp"
#include "font_asset_control.hpp"
#include "image_asset_control.hpp"
#include "simcore_features.hpp"
#include "simhub_protocol.hpp"

#include <array>
#include <cstddef>

namespace simcore::configuration {
class ConfigurationService;
}

namespace simcore::font_assets {
class Service;
}

namespace simcore::image_assets {
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

class Composition final {
 public:
  static constexpr std::size_t kMaximumLinks = 1;

  explicit Composition(const telemetry::ITelemetryRegistry& registry);
  ~Composition();

  Composition(const Composition&) = delete;
  Composition& operator=(const Composition&) = delete;

  enum class Surface : std::uint8_t { full, recovery };

  [[nodiscard]] bool start(
      configuration::ConfigurationService& configuration,
      firmware_update::Service& firmware_update,
      font_assets::Service& font_assets,
      image_assets::Service& image_assets,
      telemetry::TelemetryProvider& telemetry,
      std::span<transport::ITransport* const> transports,
      configuration::ConfigurationControl::ApplyHandler apply_handler,
      void* apply_context,
      std::span<std::uint8_t> control_io_buffer,
      std::span<std::uint8_t> control_line_buffers,
      Surface surface);
  void stop();

  void mark_composed();

 private:
  struct Link {
    explicit Link(const telemetry::ITelemetryRegistry& registry)
        : protocol(registry) {}

    Composition* owner{};
    transport::ITransport* transport{};
    Router router;
    protocols::SimHubProtocol protocol;
  };

  static void submit_update(const telemetry::TelemetryUpdate& update,
                            void* context);
  static void receive_telemetry_line(
      std::span<const std::uint8_t> line, void* context);
  static void receive_transport_data(
      std::span<const std::uint8_t> data, void* context);
  static void reboot(void* context);

  configuration::ConfigurationControl configuration_control_;
  firmware_update::FirmwareUpdateControl firmware_update_control_;
  font_assets::FontAssetControl font_asset_control_;
  image_assets::ImageAssetControl image_asset_control_;
  binary_session::Claim binary_claim_;
  std::array<std::uint8_t, asset_control::kMaximumFrameSize> upload_frame_{};
  std::array<Link, kMaximumLinks> links_;
  std::size_t link_count_{};
  telemetry::TelemetryProvider* telemetry_{};
  bool started_{};
};

}
