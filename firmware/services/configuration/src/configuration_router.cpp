#include "configuration_router.hpp"

#include <algorithm>

namespace simcore::configuration {
namespace {

constexpr std::array<std::uint8_t, 4> kControlPrefix{'@', 'S', 'C', ':'};

}  // namespace

void ConfigurationRouter::initialize(
    ConfigurationControl& control,
    const transport::DataHandler telemetry_handler,
    void* const telemetry_context) {
  control_ = &control;
  telemetry_handler_ = telemetry_handler;
  telemetry_context_ = telemetry_context;
  line_size_ = 0;
  discarding_ = false;
}

void ConfigurationRouter::consume(
    const std::span<const std::uint8_t> data) {
  for (const std::uint8_t value : data) {
    if (discarding_) {
      if (value == '\n') {
        discarding_ = false;
        line_size_ = 0;
      }
      continue;
    }
    if (value == '\r') {
      continue;
    }
    if (value == '\n') {
      dispatch();
      line_size_ = 0;
      continue;
    }
    if (line_size_ == line_.size()) {
      discarding_ = true;
      line_size_ = 0;
      continue;
    }
    line_[line_size_++] = value;
  }
}

void ConfigurationRouter::dispatch() {
  const std::span<const std::uint8_t> line(line_.data(), line_size_);
  if (line.empty()) {
    return;
  }
  if (line.size() >= kControlPrefix.size() &&
      std::equal(kControlPrefix.begin(), kControlPrefix.end(),
                 line.begin())) {
    if (control_ != nullptr) {
      control_->consume(line);
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

}  // namespace simcore::configuration
