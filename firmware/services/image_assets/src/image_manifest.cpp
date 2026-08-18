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
constexpr std::size_t kEntryReservedByteOffset = 37;
constexpr std::size_t kEntryStrideOffset = 38;
constexpr std::size_t kEntryDataOffset = 40;
constexpr std::size_t kEntryLengthOffset = 44;
constexpr std::size_t kEntryCrcOffset = 48;
constexpr std::size_t kEntryPaletteOffset = 52;
constexpr std::size_t kEntryPaletteCountOffset = 56;
constexpr std::size_t kEntryReservedWordOffset = 58;
constexpr std::size_t kEntryReservedTailOffset = 60;

[[nodiscard]] bool known_format(const std::uint8_t value, ColorFormat& format) {
  switch (value) {
    case static_cast<std::uint8_t>(ColorFormat::rgb565):
    case static_cast<std::uint8_t>(ColorFormat::rgb565a8):
    case static_cast<std::uint8_t>(ColorFormat::indexed8):
    case static_cast<std::uint8_t>(ColorFormat::alpha8):
      format = static_cast<ColorFormat>(value);
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
  parsed.package_size = payload_size;
  for (std::size_t index = 0; index < entry_count; ++index) {
    const auto entry =
        manifest.subspan(index * kManifestEntrySize, kManifestEntrySize);
    ImageAsset& asset = parsed.images[index];
    std::copy_n(entry.begin() + kEntryIdOffset, asset.id.size(), asset.id.begin());
    asset.width = binary::read_u16_le(entry, kEntryWidthOffset);
    asset.height = binary::read_u16_le(entry, kEntryHeightOffset);
    asset.stride = binary::read_u16_le(entry, kEntryStrideOffset);
    asset.palette_count = binary::read_u16_le(entry, kEntryPaletteCountOffset);
    const std::uint32_t offset = binary::read_u32_le(entry, kEntryDataOffset);
    const std::uint32_t length = binary::read_u32_le(entry, kEntryLengthOffset);
    if (!valid_image_id(asset.id) || !known_format(entry[kEntryFormatOffset], asset.format) ||
        entry[kEntryReservedByteOffset] != 0 ||
        binary::read_u16_le(entry, kEntryReservedWordOffset) != 0 ||
        binary::read_u32_le(entry, kEntryReservedTailOffset) != 0 ||
        asset.width == 0 || asset.height == 0 ||
        asset.width > kMaximumImageDimension ||
        asset.height > kMaximumImageDimension ||
        offset < kAssetDataOffset || offset > payload_size ||
        (offset & (kImageAlignment - 1)) != 0 || length == 0 ||
        length > payload_size - offset) {
      return false;
    }
    // The geometry check is what the sfnt signature is for a face: it catches a
    // malformed asset at commit rather than inside a draw, where a short buffer
    // would be read past its end.
    if (asset.stride != color_stride(asset.format, asset.width) ||
        length != image_bytes(asset.format, asset.width, asset.height,
                              asset.palette_count) ||
        (asset.format == ColorFormat::indexed8) != (asset.palette_count > 0) ||
        asset.palette_count > 256 ||
        binary::read_u32_le(entry, kEntryPaletteOffset) !=
            (asset.format == ColorFormat::indexed8 ? offset : 0U)) {
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
    case ColorFormat::indexed8:
      return "indexed8";
    case ColorFormat::alpha8:
      return "alpha8";
  }
  return "unknown";
}

}  // namespace simcore::image_assets
