#include "communication_router.hpp"

#include <algorithm>
#include <string_view>

namespace simcore::communication {
namespace {

constexpr std::array<std::uint8_t, 4> kControlPrefix{'@', 'S', 'C', ':'};
constexpr std::string_view kFontControlPrefix = "@SC:FONT:";

}  // namespace

void Router::initialize(
    configuration::ConfigurationControl& control,
    font_assets::FontAssetControl& font_asset_control,
    const transport::DataHandler telemetry_handler,
    void* const telemetry_context) {
  control_ = &control;
  font_asset_control_ = &font_asset_control;
  telemetry_handler_ = telemetry_handler;
  telemetry_context_ = telemetry_context;
  line_size_ = 0;
  discarding_ = false;
}

void Router::consume(const std::span<const std::uint8_t> data) {
  for (std::size_t index = 0; index < data.size(); ++index) {
    if (font_asset_control_ != nullptr && font_asset_control_->active()) {
      font_asset_control_->consume(data.subspan(index));
      return;
    }
    const std::uint8_t value = data[index];
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

void Router::dispatch() {
  const std::span<const std::uint8_t> line(line_.data(), line_size_);
  if (line.empty()) {
    return;
  }
  if (line.size() >= kControlPrefix.size() &&
      std::equal(kControlPrefix.begin(), kControlPrefix.end(), line.begin())) {
    if (font_asset_control_ != nullptr &&
        line.size() >= kFontControlPrefix.size() &&
        std::equal(kFontControlPrefix.begin(), kFontControlPrefix.end(),
                   line.begin())) {
      font_asset_control_->consume_command(line);
      return;
    }
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

}  // namespace simcore::communication
