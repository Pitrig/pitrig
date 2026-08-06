#include "font_asset_service.hpp"

#include <algorithm>
#include <array>
#include <string_view>

#include "binary_codec.hpp"
#include "crc32.hpp"

namespace simcore::font_assets {
namespace {

constexpr std::uint32_t kMagic = 0x4146'4353U;
constexpr std::size_t kManifestOffset = kHeaderSize;
constexpr std::size_t kHeaderMagicOffset = 0;
constexpr std::size_t kHeaderFormatVersionOffset = 4;
constexpr std::size_t kHeaderSizeOffset = 6;
constexpr std::size_t kHeaderReservedWordOffset = 8;
constexpr std::size_t kHeaderEntryCountOffset = 12;
constexpr std::size_t kHeaderReservedOffset = 14;
constexpr std::size_t kHeaderPayloadSizeOffset = 16;
constexpr std::size_t kHeaderManifestCrcOffset = 20;
constexpr std::size_t kHeaderPayloadCrcOffset = 24;
constexpr std::size_t kHeaderCrcOffset = 28;
constexpr std::size_t kEntryFamilyOffset = 0;
constexpr std::size_t kEntrySizeOffset = 32;
constexpr std::size_t kEntryReservedOffset = 34;
constexpr std::size_t kEntryDataOffset = 36;
constexpr std::size_t kEntryLengthOffset = 40;
constexpr std::size_t kEntryCrcOffset = 44;

[[nodiscard]] bool valid_family(const FamilyId& family) {
  const std::string_view value = family_id_view(family);
  if (value.empty() || value.size() > kMaximumFamilyIdLength) {
    return false;
  }
  for (const char character : value) {
    const bool valid_character =
        (character >= 'a' && character <= 'z') ||
        (character >= '0' && character <= '9') || character == '_' ||
        character == '-';
    if (!valid_character) {
      return false;
    }
  }
  return true;
}

[[nodiscard]] bool ranges_overlap(const AssetView& lhs,
                                  const AssetView& rhs) {
  const auto* const lhs_begin = lhs.bytes.data();
  const auto* const lhs_end = lhs_begin + lhs.bytes.size();
  const auto* const rhs_begin = rhs.bytes.data();
  const auto* const rhs_end = rhs_begin + rhs.bytes.size();
  return lhs_begin < rhs_end && rhs_begin < lhs_end;
}

}  // namespace

Service::~Service() {
  if (storage_ != nullptr) {
    storage_->unmap();
  }
}

bool Service::initialize(IStorage& storage) {
  if (storage_ != nullptr) {
    storage_->unmap();
  }
  storage_ = &storage;
  status_ = {};
  package_mapping_ = {};
  package_ = {};
  asset_catalog_ = {};
  reset_update();
  status_.storage_available = storage.initialize();
  if (!status_.storage_available) {
    return false;
  }

  if (!storage.map(package_mapping_)) {
    return false;
  }
  if (!validate_package(package_mapping_, {}, package_)) {
    storage.unmap();
    package_mapping_ = {};
    package_ = {};
    return true;
  }

  status_.package_available = true;
  status_.format_version = kFormatVersion;
  status_.asset_count = package_.asset_count;
  status_.package_size = package_.package_size;
  for (std::size_t index = 0; index < package_.asset_count; ++index) {
    asset_catalog_[index] = package_.assets[index].font;
  }
  return true;
}

const AssetView* Service::find(const FontSpec& font) const {
  const auto available = assets();
  const auto match = std::find_if(
      available.begin(), available.end(),
      [&font](const AssetView& asset) { return asset.font == font; });
  return match == available.end() ? nullptr : &*match;
}

UpdateError Service::begin_update(const std::size_t package_size) {
  if (storage_ == nullptr || !status_.storage_available) {
    return UpdateError::unavailable;
  }
  if (update_in_progress_) {
    return UpdateError::busy;
  }
  if (status_.reboot_required) {
    return UpdateError::reboot_required;
  }
  if (package_size < kAssetDataOffset || package_size > kStorageSize) {
    return UpdateError::invalid_size;
  }
  storage_->unmap();
  package_mapping_ = {};
  package_ = {};
  clear_package_status();
  if (!storage_->erase()) {
    return UpdateError::storage_failure;
  }
  update_in_progress_ = true;
  update_size_ = package_size;
  update_received_ = 0;
  update_header_.fill(0xFFU);
  return UpdateError::none;
}

UpdateError Service::write_update(
    const std::span<const std::uint8_t> bytes) {
  if (!update_in_progress_) {
    return UpdateError::invalid_state;
  }
  if (bytes.empty() || bytes.size() > update_size_ - update_received_) {
    return UpdateError::invalid_size;
  }

  std::size_t source_offset{};
  if (update_received_ < update_header_.size()) {
    const std::size_t header_bytes =
        std::min(bytes.size(), update_header_.size() - update_received_);
    std::copy_n(bytes.begin(), header_bytes,
                update_header_.begin() + update_received_);
    source_offset = header_bytes;
    update_received_ += header_bytes;
  }
  if (source_offset < bytes.size()) {
    const auto body = bytes.subspan(source_offset);
    if (!storage_->write(update_received_, body)) {
      reset_update();
      return UpdateError::storage_failure;
    }
    update_received_ += body.size();
  }
  return UpdateError::none;
}

UpdateError Service::commit_update() {
  if (!update_in_progress_ || update_received_ != update_size_) {
    return UpdateError::invalid_state;
  }

  package_ = {};
  std::span<const std::uint8_t> candidate_mapping;
  if (!storage_->map(candidate_mapping)) {
    return UpdateError::storage_failure;
  }
  const bool valid =
      validate_package(candidate_mapping, update_header_, package_);
  storage_->unmap();
  if (!valid ||
      binary::read_u32_le(update_header_, kHeaderPayloadSizeOffset) !=
          update_size_) {
    package_ = {};
    reset_update();
    return UpdateError::invalid_package;
  }
  if (!storage_->write(0, update_header_)) {
    package_ = {};
    reset_update();
    return UpdateError::storage_failure;
  }

  candidate_mapping = {};
  if (!storage_->map(candidate_mapping) ||
      !validate_package(candidate_mapping, {}, package_)) {
    storage_->unmap();
    package_ = {};
    reset_update();
    return UpdateError::storage_failure;
  }
  storage_->unmap();
  status_.package_available = true;
  status_.format_version = kFormatVersion;
  status_.asset_count = package_.asset_count;
  status_.package_size = package_.package_size;
  asset_catalog_ = {};
  for (std::size_t index = 0; index < package_.asset_count; ++index) {
    asset_catalog_[index] = package_.assets[index].font;
  }
  package_ = {};
  reset_update();
  status_.reboot_required = true;
  return UpdateError::none;
}

void Service::cancel_update() {
  if (storage_ != nullptr && update_in_progress_) {
    storage_->unmap();
  }
  reset_update();
}

bool Service::validate_package(
    const std::span<const std::uint8_t> storage_bytes,
    const std::span<const std::uint8_t> header_override,
    ParsedPackage& parsed) const {
  parsed = {};
  if (storage_bytes.size() != kStorageSize ||
      (!header_override.empty() && header_override.size() != kHeaderSize)) {
    return false;
  }
  const auto header = header_override.empty()
                          ? storage_bytes.first(kHeaderSize)
                          : header_override;
  const std::uint16_t entry_count =
      binary::read_u16_le(header, kHeaderEntryCountOffset);
  const std::uint32_t payload_size =
      binary::read_u32_le(header, kHeaderPayloadSizeOffset);
  const std::size_t manifest_size =
      static_cast<std::size_t>(entry_count) * kManifestEntrySize;
  if (binary::read_u32_le(header, kHeaderMagicOffset) != kMagic ||
      binary::read_u16_le(header, kHeaderFormatVersionOffset) !=
          kFormatVersion ||
      binary::read_u16_le(header, kHeaderSizeOffset) != kHeaderSize ||
      binary::read_u32_le(header, kHeaderReservedWordOffset) != 0 ||
      entry_count > kMaximumAssets ||
      binary::read_u16_le(header, kHeaderReservedOffset) != 0 ||
      kManifestOffset + manifest_size > kAssetDataOffset ||
      payload_size < kAssetDataOffset || payload_size > storage_bytes.size() ||
      binary::read_u32_le(header, kHeaderCrcOffset) !=
          binary::crc32(header.first(kHeaderCrcOffset))) {
    return false;
  }

  const auto manifest = storage_bytes.subspan(kManifestOffset, manifest_size);
  if (binary::read_u32_le(header, kHeaderManifestCrcOffset) !=
          binary::crc32(manifest) ||
      binary::read_u32_le(header, kHeaderPayloadCrcOffset) !=
          binary::crc32(storage_bytes.subspan(
              kAssetDataOffset, payload_size - kAssetDataOffset))) {
    return false;
  }
  parsed.asset_count = entry_count;
  parsed.package_size = payload_size;
  for (std::size_t index = 0; index < entry_count; ++index) {
    const auto entry = manifest.subspan(index * kManifestEntrySize,
                                        kManifestEntrySize);
    AssetView& asset = parsed.assets[index];
    std::copy_n(entry.begin() + kEntryFamilyOffset, asset.font.family.size(),
                asset.font.family.begin());
    asset.font.size_px = binary::read_u16_le(entry, kEntrySizeOffset);
    const std::uint32_t offset =
        binary::read_u32_le(entry, kEntryDataOffset);
    const std::uint32_t length =
        binary::read_u32_le(entry, kEntryLengthOffset);
    if (!valid_family(asset.font.family) || asset.font.size_px == 0 ||
        asset.font.size_px > kMaximumFontSizePx ||
        binary::read_u16_le(entry, kEntryReservedOffset) != 0 ||
        offset < kAssetDataOffset || offset > payload_size ||
        (offset & 0x3U) != 0 || length == 0 ||
        length > payload_size - offset) {
      return false;
    }
    asset.bytes = storage_bytes.subspan(offset, length);
    if (binary::read_u32_le(entry, kEntryCrcOffset) !=
        binary::crc32(asset.bytes)) {
      return false;
    }
    for (std::size_t previous = 0; previous < index; ++previous) {
      if (asset.font == parsed.assets[previous].font ||
          ranges_overlap(asset, parsed.assets[previous])) {
        return false;
      }
    }
  }
  return true;
}

void Service::clear_package_status() {
  status_.package_available = false;
  status_.reboot_required = false;
  status_.format_version = 0;
  status_.asset_count = 0;
  status_.package_size = 0;
  asset_catalog_ = {};
}

void Service::reset_update() {
  update_in_progress_ = false;
  update_size_ = 0;
  update_received_ = 0;
  update_header_.fill(0xFFU);
}

const char* update_error_name(const UpdateError error) {
  switch (error) {
    case UpdateError::none:
      return "none";
    case UpdateError::unavailable:
      return "unavailable";
    case UpdateError::busy:
      return "busy";
    case UpdateError::invalid_size:
      return "invalid_size";
    case UpdateError::invalid_state:
      return "invalid_state";
    case UpdateError::invalid_package:
      return "invalid_package";
    case UpdateError::reboot_required:
      return "reboot_required";
    case UpdateError::storage_failure:
      return "storage_failure";
  }
  return "unknown";
}

}  // namespace simcore::font_assets
