#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "image_asset_service.hpp"
#include "lvgl.h"

namespace simcore::dashboard::images {

// Every uploaded image as an LVGL descriptor, built once at boot.
//
// Unlike a font, an image needs no per-configuration acquire or release: a
// descriptor is a value with no LVGL object behind it, so the whole table is
// built when the package is copied and left alone. Resolution is exact — a
// widget naming an image that is not installed is a composition error, never a
// silent substitution.
class Registry final {
 public:
  Registry() = default;
  Registry(const Registry&) = delete;
  Registry& operator=(const Registry&) = delete;

  /**
   * Copies every image into caller-owned storage and describes it. The package
   * mapping is released by the next upload while the dashboard is still
   * drawing, which is what the copy is for; `storage` must be at least
   * `image_assets.image_bytes_total()` bytes.
   */
  [[nodiscard]] bool load(std::span<const image_assets::ImageAsset> assets,
                          std::span<std::uint8_t> storage);

  [[nodiscard]] bool has_image(const image_assets::ImageId& id) const;
  [[nodiscard]] const lv_image_dsc_t* resolve(
      const image_assets::ImageId& id) const;

 private:
  struct Entry {
    image_assets::ImageId id{};
    lv_image_dsc_t descriptor{};
  };

  std::array<Entry, image_assets::kMaximumImages> entries_{};
  std::size_t count_{};
};

}  // namespace simcore::dashboard::images
