#pragma once

#include <cstdint>
#include <span>

#include "configuration_control.hpp"
#include "communication_router.hpp"
#include "binary_session.hpp"
#include "font_asset_control.hpp"
#include "image_asset_control.hpp"
#include "simcore_features.hpp"
#include "simhub_protocol.hpp"
#if SIMCORE_SECOND_TELEMETRY_LINK
#include <array>
#include <cstddef>
#endif

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

// Owns protocol and control-plane routing for one selected transport. The core
// supplies services and a transport but does not depend on a concrete protocol.
//
// A development build may attach a second link. Line assembly and protocol
// decoding are then per link, but the services behind them are not: there is
// still one configuration state and one upload engine per asset kind, so a
// request carries the link it must be answered on.
class Composition final {
 public:
#if SIMCORE_SECOND_TELEMETRY_LINK
  static constexpr std::size_t kMaximumLinks = 2;
#else
  static constexpr std::size_t kMaximumLinks = 1;
#endif

  explicit Composition(const telemetry::ITelemetryRegistry& registry);
  ~Composition();

  Composition(const Composition&) = delete;
  Composition& operator=(const Composition&) = delete;

#if SIMCORE_SECOND_TELEMETRY_LINK
  // `transports` holds one to kMaximumLinks links, and `control_line_buffers`
  // one Router::kControlLineBufferSize block per link.
  [[nodiscard]] bool start(
      configuration::ConfigurationService& configuration,
      font_assets::Service& font_assets,
      image_assets::Service& image_assets,
      telemetry::TelemetryProvider& telemetry,
      std::span<transport::ITransport* const> transports,
      configuration::ConfigurationControl::ApplyHandler apply_handler,
      void* apply_context,
      std::span<std::uint8_t> control_io_buffer,
      std::span<std::uint8_t> control_line_buffers);
#else
  [[nodiscard]] bool start(
      configuration::ConfigurationService& configuration,
      font_assets::Service& font_assets,
      image_assets::Service& image_assets,
      telemetry::TelemetryProvider& telemetry,
      transport::ITransport& transport,
      configuration::ConfigurationControl::ApplyHandler apply_handler,
      void* apply_context,
      std::span<std::uint8_t> control_io_buffer,
      std::span<std::uint8_t> control_line_buffer);
#endif
  void stop();

 private:
#if SIMCORE_SECOND_TELEMETRY_LINK
  // One attached serial link: what it is, how its bytes are split, and how its
  // telemetry lines are decoded.
  struct Link {
    explicit Link(const telemetry::ITelemetryRegistry& registry)
        : protocol(registry) {}

    Composition* owner{};
    transport::ITransport* transport{};
    Router router;
    protocols::SimHubProtocol protocol;
  };
#endif

  static void submit_update(const telemetry::TelemetryUpdate& update,
                            void* context);
  static void receive_telemetry_data(
      std::span<const std::uint8_t> data, void* context);
  static void receive_transport_data(
      std::span<const std::uint8_t> data, void* context);
  static void reboot(void* context);

  configuration::ConfigurationControl configuration_control_;
  font_assets::FontAssetControl font_asset_control_;
  image_assets::ImageAssetControl image_asset_control_;
  // However many links are attached, only one of them may own the binary
  // stream at a time.
  binary_session::Claim binary_claim_;
#if SIMCORE_SECOND_TELEMETRY_LINK
  std::array<Link, kMaximumLinks> links_;
  std::size_t link_count_{};
#else
  Router router_;
  protocols::SimHubProtocol protocol_;
  transport::ITransport* transport_{};
#endif
  telemetry::TelemetryProvider* telemetry_{};
  bool started_{};
};

}  // namespace simcore::communication
