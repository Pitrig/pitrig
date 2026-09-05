#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "image_asset_service.hpp"
#include "lvgl.h"

namespace pitrig::dashboard::images {

struct Sheet {
  lv_image_dsc_t descriptor{};
  std::size_t frame_count{};
  std::size_t frame_stride{};
};

class Registry final {
 public:
  Registry() = default;
  Registry(const Registry&) = delete;
  Registry& operator=(const Registry&) = delete;

  [[nodiscard]] bool load(std::span<const image_assets::ImageAsset> assets,
                          std::span<std::uint8_t> storage);

  [[nodiscard]] bool has_image(const image_assets::ImageId& id) const;
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

}
