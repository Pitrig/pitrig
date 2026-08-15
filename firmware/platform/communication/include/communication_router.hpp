#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "configuration_control.hpp"
#include "configuration_json.hpp"
#include "font_asset_control.hpp"
#include "transport.hpp"

namespace simcore::communication {

class Router final {
 public:
  static constexpr std::size_t kControlLineBufferSize =
      16 + configuration::kMaximumPayloadSize;

  void initialize(configuration::ConfigurationControl& control,
                  font_assets::FontAssetControl& font_asset_control,
                  transport::DataHandler telemetry_handler,
                  void* telemetry_context,
                  std::span<std::uint8_t> control_line_buffer);
  void reset();
  void consume(std::span<const std::uint8_t> data);

 private:
  static constexpr std::size_t kMaximumTelemetryLineSize = 127;

  void dispatch();

  configuration::ConfigurationControl* control_{};
  font_assets::FontAssetControl* font_asset_control_{};
  transport::DataHandler telemetry_handler_{};
  void* telemetry_context_{};
  std::array<std::uint8_t, kMaximumTelemetryLineSize> telemetry_line_{};
  std::span<std::uint8_t> control_line_{};
  std::size_t line_size_{};
  bool control_line_active_{};
  bool discarding_{};
};

}  // namespace simcore::communication
