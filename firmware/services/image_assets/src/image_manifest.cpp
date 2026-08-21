#include "image_asset_service.hpp"

#include <algorithm>
#include <cstdint>

#include "binary_codec.hpp"
#include "crc32.hpp"

// What one image entry in the manifest means. This is the whole of what makes
// the image package differ from the font one: a face describes itself, a
// bitmap does not, so geometry, colour format and stride are validated here
// rather than discovered inside a draw. Everything the two kinds share lives
// in services/asset_package.
namespace simcore::image_assets {
namespace {

constexpr std::size_t kEntryIdOffset = 0;
constexpr std::size_t kEntryWidthOffset = 32;
constexpr std::size_t kEntryHeightOffset = 34;
constexpr std::size_t kEntryFormatOffset = 36;
constexpr std::size_t kEntryCompressionOffset = 37;
constexpr std::size_t kEntryStrideOffset = 38;
constexpr std::size_t kEntryDataOffset = 40;
constexpr std::size_t kEntryLengthOffset = 44;
constexpr std::size_t kEntryCrcOffset = 48;
constexpr std::size_t kEntryPaletteOffset = 52;
constexpr std::size_t kEntryPaletteCountOffset = 56;
constexpr std::size_t kEntryFrameCountOffset = 58;
constexpr std::size_t kEntryReservedTailOffset = 60;

// `indexed8` is deliberately absent: the value is reserved, not accepted, so a
// package naming it is refused here rather than drawn wrong.
[[nodiscard]] bool known_format(const std::uint8_t value, ColorFormat& format) {
  switch (value) {
    case static_cast<std::uint8_t>(ColorFormat::rgb565):
    case static_cast<std::uint8_t>(ColorFormat::rgb565a8):
    case static_cast<std::uint8_t>(ColorFormat::alpha8):
      format = static_cast<ColorFormat>(value);
      return true;
    default:
      return false;
  }
}

// Version 1 had no compression byte — the field was reserved and required to be
// zero — so reading a version 1 package is exactly reading `none`.
[[nodiscard]] bool known_compression(const std::uint8_t value,
                                     const std::uint16_t format_version,
                                     Compression& compression) {
  if (format_version < 2) {
    compression = Compression::none;
    return value == 0;
  }
  switch (value) {
    case static_cast<std::uint8_t>(Compression::none):
    case static_cast<std::uint8_t>(Compression::deflate):
      compression = static_cast<Compression>(value);
      return true;
    default:
      return false;
  }
}

[[nodiscard]] bool ranges_overlap(const ImageAsset& lhs, const ImageAsset& rhs) {
  const auto* const lhs_begin = lhs.bytes.data();
  const auto* const lhs_end = lhs_begin + lhs.bytes.size();
  const auto* const rhs_begin = rhs.bytes.data();
  const auto* const rhs_end = rhs_begin + rhs.bytes.size();
  return lhs_begin < rhs_end && rhs_begin < lhs_end;
}

}  // namespace

bool Service::validate_package(
    const std::span<const std::uint8_t> storage_bytes,
    const std::span<const std::uint8_t> header_override,
    ParsedPackage& parsed) const {
  parsed = {};
  constexpr asset_package::Format kFormat{
      .magic = 0x4149'4353U,
      .version = kFormatVersion,
      .minimum_version = kMinimumFormatVersion,
      .manifest_entry_size = kManifestEntrySize,
      .maximum_entries = kMaximumImages,
      .data_offset = kAssetDataOffset,
      .storage_size = kStorageSize,
  };
  asset_package::Header header{};
  if (!asset_package::validate_header(kFormat, storage_bytes, header_override,
                                      header)) {
    return false;
  }
  const std::uint16_t entry_count = header.entry_count;
  const std::uint32_t payload_size = header.payload_size;
  const std::span<const std::uint8_t> manifest = header.manifest;
  parsed.image_count = entry_count;
  parsed.format_version = header.format_version;
  parsed.package_size = payload_size;
  for (std::size_t index = 0; index < entry_count; ++index) {
    const auto entry =
        manifest.subspan(index * kManifestEntrySize, kManifestEntrySize);
    ImageAsset& asset = parsed.images[index];
    std::copy_n(entry.begin() + kEntryIdOffset, asset.id.size(), asset.id.begin());
    asset.width = binary::read_u16_le(entry, kEntryWidthOffset);
    asset.height = binary::read_u16_le(entry, kEntryHeightOffset);
    asset.stride = binary::read_u16_le(entry, kEntryStrideOffset);
    // Version 1 reserved this field at zero, and an image with no frame count
    // is an image with one frame — so an old package reads as itself.
    const std::uint16_t frames = binary::read_u16_le(entry, kEntryFrameCountOffset);
    asset.frame_count = frames == 0 ? 1 : frames;
    const std::uint32_t offset = binary::read_u32_le(entry, kEntryDataOffset);
    const std::uint32_t length = binary::read_u32_le(entry, kEntryLengthOffset);
    if (!valid_image_id(asset.id) || !known_format(entry[kEntryFormatOffset], asset.format) ||
        !known_compression(entry[kEntryCompressionOffset], header.format_version,
                           asset.compression) ||
        binary::read_u32_le(entry, kEntryReservedTailOffset) != 0 ||
        asset.width == 0 || asset.height == 0 ||
        asset.width > kMaximumImageDimension ||
        asset.height > kMaximumImageDimension ||
        asset.frame_count > kMaximumSpriteFrames ||
        (header.format_version < 2 && frames != 0) ||
        offset < kAssetDataOffset || offset > payload_size ||
        (offset & (kImageAlignment - 1)) != 0 || length == 0 ||
        length > payload_size - offset) {
      return false;
    }
    // The geometry check is what the sfnt signature is for a face: it catches a
    // malformed asset at commit rather than inside a draw, where a short buffer
    // would be read past its end. A compressed asset can only be checked for
    // fitting in memory here; whether its stream really produces that many
    // bytes is settled when it is inflated, which is the one thing that cannot
    // be known without doing it.
    const std::size_t decoded = asset.decoded_bytes();
    if (asset.stride != color_stride(asset.format, asset.width) || decoded == 0 ||
        (asset.compression == Compression::none ? length != decoded
                                                : length > decoded) ||
        // The palette belonged to `indexed8`, which is no longer accepted, so
        // both fields have to be absent rather than merely consistent.
        binary::read_u16_le(entry, kEntryPaletteCountOffset) != 0 ||
        binary::read_u32_le(entry, kEntryPaletteOffset) != 0) {
      return false;
    }
    asset.bytes = storage_bytes.subspan(offset, length);
    if (binary::read_u32_le(entry, kEntryCrcOffset) != binary::crc32(asset.bytes)) {
      return false;
    }
    for (std::size_t previous = 0; previous < index; ++previous) {
      if (asset.id == parsed.images[previous].id ||
          ranges_overlap(asset, parsed.images[previous])) {
        return false;
      }
    }
  }
  return true;
}

const char* color_format_name(const ColorFormat format) {
  switch (format) {
    case ColorFormat::rgb565:
      return "rgb565";
    case ColorFormat::rgb565a8:
      return "rgb565a8";
    case ColorFormat::indexed8_reserved:
      return "indexed8";
    case ColorFormat::alpha8:
      return "alpha8";
  }
  return "unknown";
}

}  // namespace simcore::image_assets
