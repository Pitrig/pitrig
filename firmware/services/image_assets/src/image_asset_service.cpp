#include "image_asset_service.hpp"

#include <algorithm>
#include <array>

#include "binary_codec.hpp"
#include "crc32.hpp"

namespace simcore::image_assets {
namespace {

// "SCIA". The header layout is byte-for-byte the font package's, so the two
// formats stay readable side by side and only the magic tells them apart.

// The manifest entry is where the two formats part company: a face describes
// its own geometry, a bitmap does not.
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
  image_catalog_ = {};
  reset_update();
  status_.storage_available = storage.initialize();
  if (!status_.storage_available) {
    return false;
  }

  if (!storage.map(package_mapping_)) {
    return false;
  }
  // No package is a normal state, not a failure: the board ships without one.
  if (!validate_package(package_mapping_, {}, package_)) {
    storage.unmap();
    package_mapping_ = {};
    package_ = {};
    return true;
  }

  status_.package_available = true;
  status_.format_version = kFormatVersion;
  status_.entry_count = package_.image_count;
  status_.package_size = package_.package_size;
  for (std::size_t index = 0; index < package_.image_count; ++index) {
    const ImageAsset& asset = package_.images[index];
    image_catalog_[index] = {.id = asset.id,
                             .format = asset.format,
                             .width = asset.width,
                             .height = asset.height};
  }
  return true;
}

std::size_t Service::image_bytes_total() const {
  std::size_t total{};
  for (const ImageAsset& asset : images()) {
    total += (asset.bytes.size() + kImageAlignment - 1) & ~(kImageAlignment - 1);
  }
  return total;
}

UpdateError Service::begin_update(const std::size_t package_size) {
  if (storage_ == nullptr || !status_.storage_available) {
    return UpdateError::unavailable;
  }
  if (update_in_progress_) {
    return UpdateError::busy;
  }
  // The dashboard is drawing from a copy of the previous package, but the
  // mapping is about to be erased, so a second update before a restart is
  // refused rather than raced.
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

UpdateError Service::write_update(const std::span<const std::uint8_t> bytes) {
  if (!update_in_progress_) {
    return UpdateError::invalid_state;
  }
  if (bytes.empty() || bytes.size() > update_size_ - update_received_) {
    return UpdateError::invalid_size;
  }

  // The header is held back in RAM until the rest validates, so an interrupted
  // upload leaves a partition that reads as empty rather than as a package.
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
  if (!valid || binary::read_u32_le(update_header_,
                          asset_package::kHeaderPayloadSizeOffset) !=
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

  // Read back what was actually stored rather than trusting the write.
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
  status_.entry_count = package_.image_count;
  status_.package_size = package_.package_size;
  image_catalog_ = {};
  for (std::size_t index = 0; index < package_.image_count; ++index) {
    const ImageAsset& asset = package_.images[index];
    image_catalog_[index] = {.id = asset.id,
                             .format = asset.format,
                             .width = asset.width,
                             .height = asset.height};
  }
  package_ = {};
  reset_update();
  status_.reboot_required = true;
  return UpdateError::none;
}

UpdateError Service::clear() {
  if (storage_ == nullptr || !status_.storage_available) {
    return UpdateError::unavailable;
  }
  if (update_in_progress_) {
    return UpdateError::busy;
  }
  if (status_.reboot_required) {
    return UpdateError::reboot_required;
  }
  storage_->unmap();
  package_mapping_ = {};
  package_ = {};
  clear_package_status();
  if (!storage_->erase()) {
    return UpdateError::storage_failure;
  }
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

void Service::clear_package_status() {
  status_.package_available = false;
  status_.reboot_required = false;
  status_.format_version = 0;
  status_.entry_count = 0;
  status_.package_size = 0;
  image_catalog_ = {};
}

void Service::reset_update() {
  update_in_progress_ = false;
  update_size_ = 0;
  update_received_ = 0;
  update_header_.fill(0xFFU);
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
