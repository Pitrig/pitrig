#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "binary_session.hpp"
#include "configuration_control.hpp"
#include "configuration_json.hpp"
#include "simcore_features.hpp"
#include "transport.hpp"

namespace simcore::communication {

// Splits one serial link three ways: line-oriented telemetry, the line-oriented
// `@SC:` control protocol, and — while an upload is running — a binary stream.
//
// The router knows nothing about fonts or images. A binary session registers a
// command prefix and two callbacks; who owns the byte stream is decided by the
// shared claim, so adding an asset kind adds a registration rather than a
// branch here.
//
// One router serves one link, and line assembly is its own. A development build
// that runs a second link gives it a second router: two byte streams merged
// into one line buffer would splice a half-received telemetry line onto a
// control line from the other host.
class Router final {
 public:
  static constexpr std::size_t kControlLineBufferSize =
      16 + configuration::kMaximumPayloadSize;
  static constexpr std::size_t kMaximumBinarySessions = 2;

#if SIMCORE_SECOND_TELEMETRY_LINK
  // `transport` is this router's link: where its answers go, and the identity
  // the shared claim records when an upload takes the stream.
  void initialize(configuration::ConfigurationControl& control,
                  binary_session::Claim& claim,
                  std::span<const binary_session::Session* const> sessions,
                  transport::DataHandler telemetry_handler,
                  void* telemetry_context,
                  std::span<std::uint8_t> control_line_buffer,
                  transport::ITransport& transport);
#else
  void initialize(configuration::ConfigurationControl& control,
                  binary_session::Claim& claim,
                  std::span<const binary_session::Session* const> sessions,
                  transport::DataHandler telemetry_handler,
                  void* telemetry_context,
                  std::span<std::uint8_t> control_line_buffer);
#endif
  void reset();
  void consume(std::span<const std::uint8_t> data);

 private:
  static constexpr std::size_t kMaximumTelemetryLineSize = 127;

  void dispatch();

  configuration::ConfigurationControl* control_{};
#if SIMCORE_SECOND_TELEMETRY_LINK
  transport::ITransport* transport_{};
#endif
  binary_session::Claim* claim_{};
  std::array<const binary_session::Session*, kMaximumBinarySessions> sessions_{};
  std::size_t session_count_{};
  transport::DataHandler telemetry_handler_{};
  void* telemetry_context_{};
  std::array<std::uint8_t, kMaximumTelemetryLineSize> telemetry_line_{};
  std::span<std::uint8_t> control_line_{};
  std::size_t line_size_{};
  bool control_line_active_{};
  bool discarding_{};
};

}  // namespace simcore::communication
