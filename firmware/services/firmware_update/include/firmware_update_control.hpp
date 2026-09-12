#pragma once

#include <cstdint>
#include <span>

#include "asset_control.hpp"
#include "binary_session.hpp"
#include "firmware_update_service.hpp"

namespace pitrig::firmware_update {

class FirmwareUpdateControl final {
 public:
  [[nodiscard]] bool initialize(Service& service, binary_session::Claim& claim,
                                std::span<std::uint8_t> frame);

  [[nodiscard]] const binary_session::Session& session() const { return control_.session(); }
  void stop() { control_.stop(); }

 private:
  asset_control::AssetControl control_;
};

}
