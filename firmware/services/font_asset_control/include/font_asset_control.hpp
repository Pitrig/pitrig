#pragma once

#include "asset_control.hpp"
#include "binary_session.hpp"
#include "font_asset_service.hpp"
#include "transport.hpp"

namespace simcore::font_assets {

inline constexpr std::size_t kUploadMaximumChunkSize =
    asset_control::kUploadMaximumChunkSize;

// The font side of the shared `SCF1` upload engine. A font package arrives
// exactly as an image package does, so everything but the protocol's word for
// this kind and the body of its INFO reply lives in asset_control::AssetControl
// (ADR 0010).
class FontAssetControl final {
 public:
  [[nodiscard]] bool initialize(Service& service,
                                transport::ITransport& transport,
                                binary_session::Claim& claim);

  // Registered with the router, which routes by prefix and by who holds the
  // stream rather than by knowing what a font is.
  [[nodiscard]] const binary_session::Session& session() const {
    return control_.session();
  }
  void stop() { control_.stop(); }
  [[nodiscard]] bool active() const { return control_.active(); }

 private:
  asset_control::AssetControl control_;
};

}  // namespace simcore::font_assets
