#include "communication_router.hpp"

#include <algorithm>
#include <string_view>

namespace simcore::communication {
namespace {

constexpr std::array<std::uint8_t, 4> kControlPrefix{'@', 'S', 'C', ':'};

[[nodiscard]] bool starts_with(const std::span<const std::uint8_t> line,
                               const std::string_view prefix) {
  return line.size() >= prefix.size() &&
         std::equal(prefix.begin(), prefix.end(), line.begin());
}

}  // namespace

void Router::initialize(
    configuration::ConfigurationControl& control,
    binary_session::Claim& claim,
    const std::span<const binary_session::Session* const> sessions,
    const transport::DataHandler telemetry_handler,
    void* const telemetry_context,
    const std::span<std::uint8_t> control_line_buffer,
    transport::ITransport& transport) {
  control_ = &control;
  transport_ = &transport;
  claim_ = &claim;
  session_count_ = std::min(sessions.size(), sessions_.size());
  for (std::size_t index = 0; index < session_count_; ++index) {
    sessions_[index] = sessions[index];
  }
  telemetry_handler_ = telemetry_handler;
  telemetry_context_ = telemetry_context;
  control_line_ = control_line_buffer.first(
      std::min(control_line_buffer.size(), kControlLineBufferSize));
  line_size_ = 0;
  control_line_active_ = false;
  discarding_ = false;
}

void Router::reset() {
  control_ = nullptr;
  transport_ = nullptr;
  claim_ = nullptr;
  sessions_ = {};
  session_count_ = 0;
  telemetry_handler_ = nullptr;
  telemetry_context_ = nullptr;
  control_line_ = {};
  line_size_ = 0;
  control_line_active_ = false;
  discarding_ = false;
}

void Router::consume(const std::span<const std::uint8_t> data) {
  for (std::size_t index = 0; index < data.size(); ++index) {
    // While a session owns the stream the whole remainder is its business;
    // there is no line parsing to do until it gives the stream back. Ownership
    // is per link, so an upload on another one leaves this stream alone
    // instead of swallowing its telemetry.
    if (claim_ != nullptr) {
      if (const binary_session::Session* const owner =
              claim_->owner_on(transport_);
          owner != nullptr) {
        owner->consume(owner->context, data.subspan(index));
        return;
      }
    }
    const std::uint8_t value = data[index];
    if (discarding_) {
      if (value == '\n') {
        discarding_ = false;
        line_size_ = 0;
        control_line_active_ = false;
      }
      continue;
    }
    if (value == '\r') {
      continue;
    }
    if (value == '\n') {
      dispatch();
      line_size_ = 0;
      control_line_active_ = false;
      continue;
    }
    std::span<std::uint8_t> line = control_line_active_
                                       ? control_line_
                                       : std::span<std::uint8_t>(telemetry_line_);
    if (line_size_ == line.size()) {
      discarding_ = true;
      line_size_ = 0;
      control_line_active_ = false;
      continue;
    }
    line[line_size_++] = value;
    if (!control_line_active_ && line_size_ == kControlPrefix.size() &&
        std::equal(kControlPrefix.begin(), kControlPrefix.end(),
                   telemetry_line_.begin()) &&
        control_line_.size() >= kControlPrefix.size()) {
      std::copy(kControlPrefix.begin(), kControlPrefix.end(),
                control_line_.begin());
      control_line_active_ = true;
    }
  }
}

void Router::dispatch() {
  const std::span<const std::uint8_t> line =
      control_line_active_
          ? std::span<const std::uint8_t>(control_line_.data(), line_size_)
          : std::span<const std::uint8_t>(telemetry_line_.data(), line_size_);
  if (line.empty()) {
    return;
  }
  if (line.size() >= kControlPrefix.size() &&
      std::equal(kControlPrefix.begin(), kControlPrefix.end(), line.begin())) {
    if (transport_ == nullptr) {
      return;
    }
    for (std::size_t index = 0; index < session_count_; ++index) {
      const binary_session::Session* const session = sessions_[index];
      if (session != nullptr && starts_with(line, session->command_prefix)) {
        session->consume_command(session->context, line, *transport_);
        return;
      }
    }
    if (control_ != nullptr) {
      control_->consume(line, *transport_);
    }
    return;
  }
  if (telemetry_handler_ == nullptr) {
    return;
  }
  telemetry_handler_(line, telemetry_context_);
  constexpr std::uint8_t newline = '\n';
  telemetry_handler_(std::span<const std::uint8_t>(&newline, 1),
                     telemetry_context_);
}

}  // namespace simcore::communication
