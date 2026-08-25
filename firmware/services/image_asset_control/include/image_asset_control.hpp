#pragma once

#include <cstdint>
#include <span>

#include "asset_control.hpp"
#include "binary_session.hpp"
#include "image_asset_service.hpp"

namespace simcore::image_assets {

// The image side of the shared `SCF1` upload engine. An image package arrives
// exactly as a font package does — the risky parts are the flash choreography
// rather than the pixels — so everything but the protocol's word for this kind
// and the body of its INFO reply lives in asset_control::AssetControl
// (ADR 0018).
class ImageAssetControl final {
 public:
  // `frame` is the upload frame buffer every kind shares; see
  // asset_control::AssetControl::initialize.
  [[nodiscard]] bool initialize(Service& service,
                                binary_session::Claim& claim,
                                std::span<std::uint8_t> frame);

  // Registered with the router, which routes by prefix and by who holds the
  // stream rather than by knowing what an image is.
  [[nodiscard]] const binary_session::Session& session() const {
    return control_.session();
  }
  void stop() { control_.stop(); }

 private:
  asset_control::AssetControl control_;
};

}  // namespace simcore::image_assets
