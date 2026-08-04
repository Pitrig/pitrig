#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "configuration_control.hpp"
#include "font_asset_control.hpp"
#include "transport.hpp"

namespace simcore::configuration {

class ConfigurationRouter {
 public:
  void initialize(ConfigurationControl& control,
                  font_assets::FontAssetControl& font_asset_control,
                  transport::DataHandler telemetry_handler,
                  void* telemetry_context);
  void consume(std::span<const std::uint8_t> data);

 private:
  static constexpr std::size_t kMaximumLineSize =
      16 + kMaximumPayloadSize;

  void dispatch();

  ConfigurationControl* control_{};
  font_assets::FontAssetControl* font_asset_control_{};
  transport::DataHandler telemetry_handler_{};
  void* telemetry_context_{};
  std::array<std::uint8_t, kMaximumLineSize> line_{};
  std::size_t line_size_{};
  bool discarding_{};
};

}  // namespace simcore::configuration
