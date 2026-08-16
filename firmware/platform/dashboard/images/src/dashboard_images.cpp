#include "dashboard_images.hpp"

#include <algorithm>

#include "logger.hpp"

namespace simcore::dashboard::images {
namespace {

constexpr char kTag[] = "dashboard_images";

[[nodiscard]] lv_color_format_t lvgl_format(
    const image_assets::ColorFormat format) {
  switch (format) {
    case image_assets::ColorFormat::rgb565:
      return LV_COLOR_FORMAT_RGB565;
    case image_assets::ColorFormat::rgb565a8:
      return LV_COLOR_FORMAT_RGB565A8;
    case image_assets::ColorFormat::indexed8:
      return LV_COLOR_FORMAT_I8;
    case image_assets::ColorFormat::alpha8:
      return LV_COLOR_FORMAT_A8;
  }
  return LV_COLOR_FORMAT_UNKNOWN;
}

}  // namespace

bool Registry::load(const std::span<const image_assets::ImageAsset> assets,
                    const std::span<std::uint8_t> storage) {
  entries_ = {};
  count_ = 0;
  std::size_t offset = 0;
  for (const image_assets::ImageAsset& asset : assets) {
    if (count_ == entries_.size()) {
      log::error(kTag, "More images than the registry holds");
      return false;
    }
    const std::size_t aligned =
        (asset.bytes.size() + image_assets::kImageAlignment - 1) &
        ~(image_assets::kImageAlignment - 1);
    if (offset + aligned > storage.size()) {
      log::error(kTag, "Images do not fit in the supplied storage");
      return false;
    }
    std::uint8_t* const destination = storage.data() + offset;
    std::copy(asset.bytes.begin(), asset.bytes.end(), destination);
    Entry& entry = entries_[count_];
    entry.id = asset.id;
    entry.descriptor = {};
    entry.descriptor.header.magic = LV_IMAGE_HEADER_MAGIC;
    entry.descriptor.header.cf = lvgl_format(asset.format);
    entry.descriptor.header.w = asset.width;
    entry.descriptor.header.h = asset.height;
    entry.descriptor.header.stride = asset.stride;
    entry.descriptor.data_size = static_cast<std::uint32_t>(asset.bytes.size());
    entry.descriptor.data = destination;
    ++count_;
    offset += aligned;
  }
  return true;
}

bool Registry::has_image(const image_assets::ImageId& id) const {
  return resolve(id) != nullptr;
}

const lv_image_dsc_t* Registry::resolve(const image_assets::ImageId& id) const {
  for (std::size_t index = 0; index < count_; ++index) {
    if (entries_[index].id == id) {
      return &entries_[index].descriptor;
    }
  }
  return nullptr;
}

}  // namespace simcore::dashboard::images
