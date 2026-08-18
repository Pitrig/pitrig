#include "font_asset_service.hpp"

#include <algorithm>
#include <cstdint>
#include <string_view>

#include "binary_codec.hpp"
#include "crc32.hpp"

// What one family entry in the manifest means, and what makes a face a face.
// This is the whole of what makes the font package differ from the image one:
// a face describes its own geometry and a bitmap does not, so a font entry
// carries no dimensions and instead has its sfnt signature checked. Everything
// the two kinds share lives in services/asset_package.
namespace simcore::font_assets {
namespace {

constexpr std::size_t kEntryFamilyOffset = 0;
constexpr std::size_t kEntryReservedOffset = 32;
constexpr std::size_t kEntryDataOffset = 36;
constexpr std::size_t kEntryLengthOffset = 40;
constexpr std::size_t kEntryCrcOffset = 44;
// A face is parsed lazily on the render path, so a payload that is not an sfnt
// container is rejected at commit instead of failing inside a frame. The four
// accepted signatures are TrueType, OpenType/CFF, the legacy Apple tag, and a
// TrueType collection.
constexpr std::size_t kMinimumFaceSize = 128;
constexpr std::uint32_t kSfntVersion1 = 0x0001'0000U;
constexpr std::uint32_t kSfntOpenType = 0x4F54'544FU;
constexpr std::uint32_t kSfntTrue = 0x7472'7565U;
constexpr std::uint32_t kSfntCollection = 0x7474'6366U;

[[nodiscard]] bool valid_face(const std::span<const std::uint8_t> bytes) {
  if (bytes.size() < kMinimumFaceSize) {
    return false;
  }
  const std::uint32_t signature =
      (static_cast<std::uint32_t>(bytes[0]) << 24) |
      (static_cast<std::uint32_t>(bytes[1]) << 16) |
      (static_cast<std::uint32_t>(bytes[2]) << 8) |
      static_cast<std::uint32_t>(bytes[3]);
  return signature == kSfntVersion1 || signature == kSfntOpenType ||
         signature == kSfntTrue || signature == kSfntCollection;
}

[[nodiscard]] bool ranges_overlap(const FamilyAsset& lhs,
                                  const FamilyAsset& rhs) {
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
      .magic = 0x4146'4353U,
      .version = kFormatVersion,
      .manifest_entry_size = kManifestEntrySize,
      .maximum_entries = kMaximumFamilies,
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
  parsed.family_count = entry_count;
  parsed.package_size = payload_size;
  for (std::size_t index = 0; index < entry_count; ++index) {
    const auto entry = manifest.subspan(index * kManifestEntrySize,
                                        kManifestEntrySize);
    FamilyAsset& asset = parsed.families[index];
    std::copy_n(entry.begin() + kEntryFamilyOffset, asset.family.size(),
                asset.family.begin());
    const std::uint32_t offset =
        binary::read_u32_le(entry, kEntryDataOffset);
    const std::uint32_t length =
        binary::read_u32_le(entry, kEntryLengthOffset);
    if (!valid_family_id(asset.family) ||
        binary::read_u32_le(entry, kEntryReservedOffset) != 0 ||
        offset < kAssetDataOffset || offset > payload_size ||
        (offset & (kFaceAlignment - 1)) != 0 || length == 0 ||
        length > payload_size - offset) {
      return false;
    }
    asset.bytes = storage_bytes.subspan(offset, length);
    if (!valid_face(asset.bytes) ||
        binary::read_u32_le(entry, kEntryCrcOffset) !=
            binary::crc32(asset.bytes)) {
      return false;
    }
    for (std::size_t previous = 0; previous < index; ++previous) {
      if (asset.family == parsed.families[previous].family ||
          ranges_overlap(asset, parsed.families[previous])) {
        return false;
      }
    }
  }
  return true;
}

}  // namespace simcore::font_assets
