#include "font_asset_service.hpp"

#include <algorithm>
#include <array>
#include <limits>
#include <string_view>

namespace simcore::font_assets {
namespace {

constexpr std::uint32_t kMagic = 0x4146'4353U;
constexpr std::size_t kManifestOffset = kHeaderSize;
constexpr std::size_t kHeaderMagicOffset = 0;
constexpr std::size_t kHeaderFormatVersionOffset = 4;
constexpr std::size_t kHeaderSizeOffset = 6;
constexpr std::size_t kHeaderGenerationOffset = 8;
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

[[nodiscard]] std::uint16_t get_u16(
    const std::span<const std::uint8_t> input, const std::size_t offset) {
  return static_cast<std::uint16_t>(input[offset]) |
         static_cast<std::uint16_t>(input[offset + 1]) << 8U;
}

[[nodiscard]] std::uint32_t get_u32(
    const std::span<const std::uint8_t> input, const std::size_t offset) {
  std::uint32_t value{};
  for (std::size_t index = 0; index < 4; ++index) {
    value |= static_cast<std::uint32_t>(input[offset + index])
             << (index * 8U);
  }
  return value;
}

[[nodiscard]] std::uint32_t crc32(
    const std::span<const std::uint8_t> bytes) {
  constexpr std::array<std::uint32_t, 16> kTable{
      0x0000'0000U, 0x1DB7'1064U, 0x3B6E'20C8U, 0x26D9'30ACU,
      0x76DC'4190U, 0x6B6B'51F4U, 0x4DB2'6158U, 0x5005'713CU,
      0xEDB8'8320U, 0xF00F'9344U, 0xD6D6'A3E8U, 0xCB61'B38CU,
      0x9B64'C2B0U, 0x86D3'D2D4U, 0xA00A'E278U, 0xBDBD'F21CU,
  };
  std::uint32_t crc = std::numeric_limits<std::uint32_t>::max();
  for (const std::uint8_t byte : bytes) {
    crc ^= byte;
    crc = (crc >> 4U) ^ kTable[crc & 0x0FU];
    crc = (crc >> 4U) ^ kTable[crc & 0x0FU];
  }
  return ~crc;
}

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

[[nodiscard]] std::uint32_t next_generation(const Status& status) {
  if (!status.has_active_slot) {
    return 1;
  }
  return status.generation == std::numeric_limits<std::uint32_t>::max()
             ? 0
             : status.generation + 1;
}

}  // namespace

Service::~Service() {
  if (storage_ != nullptr && status_.has_active_slot) {
    storage_->unmap(status_.active_slot);
  }
}

bool Service::initialize(IStorage& storage) {
  if (storage_ != nullptr && status_.has_active_slot) {
    storage_->unmap(status_.active_slot);
  }
  storage_ = &storage;
  status_ = {};
  assets_ = {};
  active_mapping_ = {};
  reset_update();
  status_.storage_available = storage.initialize();
  if (!status_.storage_available) {
    return false;
  }

  ParsedSlot slot_a{};
  ParsedSlot slot_b{};
  const bool valid_a = inspect_slot(Slot::a, slot_a);
  const bool valid_b = inspect_slot(Slot::b, slot_b);
  if (!valid_a && !valid_b) {
    return true;
  }

  status_.active_slot =
      valid_b && (!valid_a || slot_b.generation > slot_a.generation)
          ? Slot::b
          : Slot::a;
  ParsedSlot active{};
  if (!storage.map(status_.active_slot, active_mapping_) ||
      !validate_slot(active_mapping_, {}, active)) {
    storage.unmap(status_.active_slot);
    active_mapping_ = {};
    return false;
  }
  status_.has_active_slot = true;
  status_.generation = active.generation;
  status_.asset_count = active.asset_count;
  std::copy_n(active.assets.begin(), active.asset_count, assets_.begin());
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
  if (package_size < kAssetDataOffset || package_size > kSlotSize) {
    return UpdateError::invalid_size;
  }
  update_slot_ = inactive_slot();
  storage_->unmap(update_slot_);
  if (!storage_->erase(update_slot_)) {
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
    if (!storage_->write(update_slot_, update_received_, body)) {
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

  std::span<const std::uint8_t> candidate_mapping;
  ParsedSlot candidate{};
  if (!storage_->map(update_slot_, candidate_mapping)) {
    return UpdateError::storage_failure;
  }
  const bool valid = validate_slot(candidate_mapping, update_header_, candidate);
  storage_->unmap(update_slot_);
  if (!valid ||
      get_u32(update_header_, kHeaderPayloadSizeOffset) != update_size_) {
    reset_update();
    return UpdateError::invalid_package;
  }
  if (candidate.generation != next_generation(status_)) {
    reset_update();
    return UpdateError::stale_generation;
  }
  if (!storage_->write(update_slot_, 0, update_header_)) {
    reset_update();
    return UpdateError::storage_failure;
  }

  candidate_mapping = {};
  candidate = {};
  if (!storage_->map(update_slot_, candidate_mapping) ||
      !validate_slot(candidate_mapping, {}, candidate)) {
    storage_->unmap(update_slot_);
    reset_update();
    return UpdateError::storage_failure;
  }
  storage_->unmap(update_slot_);
  reset_update();
  status_.reboot_required = true;
  return UpdateError::none;
}

void Service::cancel_update() {
  if (storage_ != nullptr && update_in_progress_) {
    storage_->unmap(update_slot_);
  }
  reset_update();
}

bool Service::inspect_slot(const Slot slot, ParsedSlot& parsed) {
  std::span<const std::uint8_t> mapping;
  if (!storage_->map(slot, mapping)) {
    return false;
  }
  const bool valid = validate_slot(mapping, {}, parsed);
  storage_->unmap(slot);
  return valid;
}

bool Service::validate_slot(
    const std::span<const std::uint8_t> slot_bytes,
    const std::span<const std::uint8_t> header_override,
    ParsedSlot& parsed) const {
  if (slot_bytes.size() != kSlotSize ||
      (!header_override.empty() && header_override.size() != kHeaderSize)) {
    return false;
  }
  const auto header = header_override.empty()
                          ? slot_bytes.first(kHeaderSize)
                          : header_override;
  const std::uint16_t entry_count =
      get_u16(header, kHeaderEntryCountOffset);
  const std::uint32_t payload_size =
      get_u32(header, kHeaderPayloadSizeOffset);
  const std::size_t manifest_size =
      static_cast<std::size_t>(entry_count) * kManifestEntrySize;
  if (get_u32(header, kHeaderMagicOffset) != kMagic ||
      get_u16(header, kHeaderFormatVersionOffset) != kFormatVersion ||
      get_u16(header, kHeaderSizeOffset) != kHeaderSize ||
      get_u32(header, kHeaderGenerationOffset) == 0 ||
      entry_count > kMaximumAssets ||
      get_u16(header, kHeaderReservedOffset) != 0 ||
      kManifestOffset + manifest_size > kAssetDataOffset ||
      payload_size < kAssetDataOffset || payload_size > slot_bytes.size() ||
      get_u32(header, kHeaderCrcOffset) !=
          crc32(header.first(kHeaderCrcOffset))) {
    return false;
  }

  const auto manifest = slot_bytes.subspan(kManifestOffset, manifest_size);
  if (get_u32(header, kHeaderManifestCrcOffset) != crc32(manifest) ||
      get_u32(header, kHeaderPayloadCrcOffset) !=
          crc32(slot_bytes.subspan(kAssetDataOffset,
                                   payload_size - kAssetDataOffset))) {
    return false;
  }

  parsed = {};
  parsed.generation = get_u32(header, kHeaderGenerationOffset);
  parsed.asset_count = entry_count;
  for (std::size_t index = 0; index < entry_count; ++index) {
    const auto entry = manifest.subspan(index * kManifestEntrySize,
                                        kManifestEntrySize);
    AssetView& asset = parsed.assets[index];
    std::copy_n(entry.begin() + kEntryFamilyOffset, asset.font.family.size(),
                asset.font.family.begin());
    asset.font.size_px = get_u16(entry, kEntrySizeOffset);
    const std::uint32_t offset = get_u32(entry, kEntryDataOffset);
    const std::uint32_t length = get_u32(entry, kEntryLengthOffset);
    if (!valid_family(asset.font.family) || asset.font.size_px == 0 ||
        asset.font.size_px > kMaximumFontSizePx ||
        get_u16(entry, kEntryReservedOffset) != 0 ||
        offset < kAssetDataOffset || offset > payload_size ||
        (offset & 0x3U) != 0 || length == 0 ||
        length > payload_size - offset) {
      return false;
    }
    asset.bytes = slot_bytes.subspan(offset, length);
    if (get_u32(entry, kEntryCrcOffset) != crc32(asset.bytes)) {
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

Slot Service::inactive_slot() const {
  if (!status_.has_active_slot) {
    return Slot::a;
  }
  return status_.active_slot == Slot::a ? Slot::b : Slot::a;
}

void Service::reset_update() {
  update_in_progress_ = false;
  update_slot_ = Slot::a;
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
    case UpdateError::stale_generation:
      return "stale_generation";
    case UpdateError::reboot_required:
      return "reboot_required";
    case UpdateError::storage_failure:
      return "storage_failure";
  }
  return "unknown";
}

}  // namespace simcore::font_assets
