#include "dashboard_images.hpp"

#include <algorithm>
#include <memory>

#include "esp_heap_caps.h"
#include "logger.hpp"
#include "miniz.h"

namespace simcore::dashboard::images {
namespace {

constexpr char kTag[] = "dashboard_images";

struct DecompressorDelete {
  void operator()(tinfl_decompressor* const decompressor) const {
    heap_caps_free(decompressor);
  }
};
using DecompressorPtr = std::unique_ptr<tinfl_decompressor, DecompressorDelete>;

[[nodiscard]] bool inflate(tinfl_decompressor& decompressor,
                           const std::span<const std::uint8_t> source,
                           std::uint8_t* const destination,
                           const std::size_t expected) {
  tinfl_init(&decompressor);
  std::size_t consumed = source.size();
  std::size_t produced = expected;
  const tinfl_status status =
      tinfl_decompress(&decompressor, source.data(), &consumed, destination,
                       destination, &produced,
                       TINFL_FLAG_USING_NON_WRAPPING_OUTPUT_BUF);
  return status == TINFL_STATUS_DONE && produced == expected;
}

[[nodiscard]] lv_color_format_t lvgl_format(
    const image_assets::ColorFormat format) {
  switch (format) {
    case image_assets::ColorFormat::rgb565:
      return LV_COLOR_FORMAT_RGB565;
    case image_assets::ColorFormat::rgb565a8:
      return LV_COLOR_FORMAT_RGB565A8;
    case image_assets::ColorFormat::alpha8:
      return LV_COLOR_FORMAT_A8;
    case image_assets::ColorFormat::indexed8_reserved:
      return LV_COLOR_FORMAT_UNKNOWN;
  }
  return LV_COLOR_FORMAT_UNKNOWN;
}

}

bool Registry::load(const std::span<const image_assets::ImageAsset> assets,
                    const std::span<std::uint8_t> storage) {
  entries_ = {};
  count_ = 0;
  DecompressorPtr decompressor;
  std::size_t offset = 0;
  for (const image_assets::ImageAsset& asset : assets) {
    if (count_ == entries_.size()) {
      log::error(kTag, "More images than the registry holds");
      return false;
    }
    const std::size_t decoded = asset.decoded_bytes();
    const std::size_t aligned =
        (decoded + image_assets::kImageAlignment - 1) &
        ~(image_assets::kImageAlignment - 1);
    if (offset + aligned > storage.size()) {
      log::error(kTag, "Images do not fit in the supplied storage");
      return false;
    }
    std::uint8_t* const destination = storage.data() + offset;
    if (asset.compression == image_assets::Compression::deflate) {
      if (!decompressor) {
        decompressor.reset(static_cast<tinfl_decompressor*>(
            heap_caps_malloc(sizeof(tinfl_decompressor), MALLOC_CAP_8BIT)));
        if (!decompressor) {
          log::error(kTag, "No memory to decompress images");
          return false;
        }
      }
      if (!inflate(*decompressor, asset.bytes, destination, decoded)) {
        log::error(kTag, "Image '%s' does not decompress to its geometry",
                   image_assets::image_id_view(asset.id).data());
        return false;
      }
    } else {
      std::copy(asset.bytes.begin(), asset.bytes.end(), destination);
    }
    Entry& entry = entries_[count_];
    entry.id = asset.id;
    entry.sheet = {};
    entry.sheet.frame_count = asset.frame_count;
    entry.sheet.frame_stride = asset.frame_stride();
    lv_image_dsc_t& descriptor = entry.sheet.descriptor;
    descriptor.header.magic = LV_IMAGE_HEADER_MAGIC;
    descriptor.header.cf = lvgl_format(asset.format);
    descriptor.header.w = asset.width;
    descriptor.header.h = asset.height;
    descriptor.header.stride = asset.stride;
    descriptor.data_size = static_cast<std::uint32_t>(entry.sheet.frame_stride);
    descriptor.data = destination;
    ++count_;
    offset += aligned;
  }
  return true;
}

bool Registry::has_image(const image_assets::ImageId& id) const {
  return resolve(id) != nullptr;
}

std::size_t Registry::frame_count(const image_assets::ImageId& id) const {
  const Sheet* const sheet = resolve(id);
  return sheet == nullptr ? 0 : sheet->frame_count;
}

const Sheet* Registry::resolve(const image_assets::ImageId& id) const {
  for (std::size_t index = 0; index < count_; ++index) {
    if (entries_[index].id == id) {
      return &entries_[index].sheet;
    }
  }
  return nullptr;
}

}
