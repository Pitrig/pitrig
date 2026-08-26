#pragma once

#include <cstdint>
#include <span>

#include "asset_control.hpp"
#include "binary_session.hpp"
#include "image_asset_service.hpp"

namespace simcore::image_assets {

class ImageAssetControl final {
 public:
  [[nodiscard]] bool initialize(Service& service,
                                binary_session::Claim& claim,
                                std::span<std::uint8_t> frame);

  [[nodiscard]] const binary_session::Session& session() const {
    return control_.session();
  }
  void stop() { control_.stop(); }

 private:
  asset_control::AssetControl control_;
};

}
