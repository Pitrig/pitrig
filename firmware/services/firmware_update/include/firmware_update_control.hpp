#pragma once

#include "asset_control.hpp"
#include "binary_session.hpp"
#include "firmware_update_service.hpp"

namespace simcore::firmware_update {

// The firmware side of the shared `SCF1` upload engine. An application image
// arrives exactly as a font or an image package does, so everything but the
// protocol's word for this kind and the body of its INFO reply lives in
// asset_control::AssetControl.
//
// Unlike fonts and images, the service behind this wrapper has no consumer
// outside the protocol — nothing reads a firmware image at runtime — so the two
// share one component instead of standing as a service and a wrapper over it.
class FirmwareUpdateControl final {
 public:
  [[nodiscard]] bool initialize(Service& service,
                                binary_session::Claim& claim);

  // Registered with the router, which routes by prefix and by who holds the
  // stream rather than by knowing what a firmware image is.
  [[nodiscard]] const binary_session::Session& session() const {
    return control_.session();
  }
  void stop() { control_.stop(); }

 private:
  asset_control::AssetControl control_;
};

}  // namespace simcore::firmware_update
