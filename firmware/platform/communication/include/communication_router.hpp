#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "binary_session.hpp"
#include "configuration_control.hpp"
#include "configuration_json.hpp"
#include "telemetry_types.hpp"
#include "transport.hpp"

namespace pitrig::communication {

class Router final {
 public:
  static constexpr std::size_t kControlLineBufferSize = 32 + configuration::kMaximumPayloadSize;
  static constexpr std::size_t kMaximumBinarySessions = 3;

  void initialize(configuration::ConfigurationControl& control, binary_session::Claim& claim,
                  std::span<const binary_session::Session* const> sessions,
                  transport::DataHandler telemetry_line_handler, void* telemetry_context,
                  std::span<std::uint8_t> control_line_buffer, transport::ITransport& transport);
  void reset();
  void consume(std::span<const std::uint8_t> data);

 private:
  static constexpr std::size_t kMaximumTelemetryLineSize = telemetry::kMaximumTelemetryLineLength;

  void dispatch();
  void refuse_overlong_control_line();

  configuration::ConfigurationControl* control_{};
  transport::ITransport* transport_{};
  binary_session::Claim* claim_{};
  std::array<const binary_session::Session*, kMaximumBinarySessions> sessions_{};
  std::size_t session_count_{};
  transport::DataHandler telemetry_line_handler_{};
  void* telemetry_context_{};
  std::array<std::uint8_t, kMaximumTelemetryLineSize> telemetry_line_{};
  std::span<std::uint8_t> control_line_{};
  std::size_t line_size_{};
  bool control_line_active_{};
  bool discarding_{};
  bool discarding_control_{};
};

}
