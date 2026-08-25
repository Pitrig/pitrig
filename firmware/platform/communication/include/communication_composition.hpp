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

// Owns protocol and control-plane routing for one selected transport. The core
// supplies services and a transport but does not depend on a concrete protocol.
//
// Line assembly and protocol decoding are per link; the services behind them
// are not, because there is one configuration state and one upload engine per
// asset kind however many links are attached, so a request carries the link it
// must be answered on. A product build attaches one link and a development
// build may attach a second — the difference is kMaximumLinks and nothing
// else, so both run the same code.
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

  // What the attached links answer. `full` is the product surface. `recovery`
  // is what a boot that has already crashed its way to safe mode brings up: the
  // control protocol, so the configuration that broke the board can be read and
  // replaced, and firmware upload, so an image that cannot run can be, and
  // nothing else. Font and image upload are left out because they write the
  // partitions a failed boot may have been reading, and telemetry because
  // nothing is composed to display it.
  enum class Surface : std::uint8_t { full, recovery };

  // `transports` holds one to kMaximumLinks links, and `control_line_buffers`
  // one Router::kControlLineBufferSize block per link.
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

  // Opens the gate a configuration write waits behind — see
  // ConfigurationControl::mark_composed(). Startup calls it once the dashboard
  // is up; a recovery link opens it for itself, since no composition is coming.
  void mark_composed();

 private:
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

  static void submit_update(const telemetry::TelemetryUpdate& update,
                            void* context);
  // One assembled telemetry line from a link's router, terminator stripped.
  static void receive_telemetry_line(
      std::span<const std::uint8_t> line, void* context);
  static void receive_transport_data(
      std::span<const std::uint8_t> data, void* context);
  static void reboot(void* context);

  configuration::ConfigurationControl configuration_control_;
  firmware_update::FirmwareUpdateControl firmware_update_control_;
  font_assets::FontAssetControl font_asset_control_;
  image_assets::ImageAssetControl image_asset_control_;
  // However many links are attached, only one of them may own the binary
  // stream at a time.
  binary_session::Claim binary_claim_;
  // And why one frame buffer serves all three upload kinds.
  std::array<std::uint8_t, asset_control::kMaximumFrameSize> upload_frame_{};
  std::array<Link, kMaximumLinks> links_;
  std::size_t link_count_{};
  telemetry::TelemetryProvider* telemetry_{};
  bool started_{};
};

}  // namespace simcore::communication
