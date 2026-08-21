#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "image_asset_service.hpp"
#include "lvgl.h"

namespace simcore::dashboard::images {

// One installed image as a widget draws it: the descriptor for its first frame,
// and what it takes to reach the others.
//
// A sheet is handed out rather than a descriptor because two widgets may show
// different frames of one image, so the descriptor a widget draws from has to
// be the widget's own. Frames are whole images stored back to back, which is
// the only layout contiguous in every colour format, so reaching frame `n` is
// advancing the data pointer by `frame_stride` and nothing else — no offset
// arithmetic inside LVGL, and the accelerated blit is untouched.
struct Sheet {
  lv_image_dsc_t descriptor{};
  std::size_t frame_count{};
  std::size_t frame_stride{};
};

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
   * Copies the given images into caller-owned storage and describes them,
   * replacing whatever the table held. The package mapping is released by the
   * next upload while the dashboard is still drawing, which is what the copy is
   * for; `storage` must hold every one of them, each aligned.
   *
   * Which images those are is the caller's decision — dashboard_composition
   * passes the ones a configuration actually draws, so a package carrying
   * pictures nothing shows costs nothing to hold.
   */
  [[nodiscard]] bool load(std::span<const image_assets::ImageAsset> assets,
                          std::span<std::uint8_t> storage);

  [[nodiscard]] bool has_image(const image_assets::ImageId& id) const;
  /** How many frames a loaded image holds, or zero if it is not loaded. */
  [[nodiscard]] std::size_t frame_count(const image_assets::ImageId& id) const;
  [[nodiscard]] const Sheet* resolve(const image_assets::ImageId& id) const;

 private:
  struct Entry {
    image_assets::ImageId id{};
    Sheet sheet{};
  };

  std::array<Entry, image_assets::kMaximumImages> entries_{};
  std::size_t count_{};
};

}  // namespace simcore::dashboard::images
