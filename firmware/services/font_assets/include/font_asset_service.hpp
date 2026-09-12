#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "asset_package.hpp"
#include "asset_storage.hpp"
#include "font_asset_types.hpp"

namespace pitrig::font_assets {

inline constexpr std::size_t kStorageSize = 3U * 1024U * 1024U;
inline constexpr std::size_t kHeaderSize = asset_package::kHeaderSize;
inline constexpr std::size_t kManifestEntrySize = 48;
inline constexpr std::size_t kAssetDataOffset = 4096;
inline constexpr std::uint16_t kFormatVersion = 3;

using IStorage = asset_storage::IStorage;

struct FamilyAsset {
  FamilyId family{};
  std::span<const std::uint8_t> bytes{};
};

using Status = asset_package::Status;
using UpdateError = asset_package::UpdateError;

class Service final {
 public:
  Service();
  Service(const Service&) = delete;
  Service& operator=(const Service&) = delete;

  class Guard final {
   public:
    explicit Guard(const Service& service) : guard_(service.slot_) {}

   private:
    asset_package::Slot::Guard guard_;
  };

  [[nodiscard]] bool initialize(IStorage& storage) { return slot_.open(storage); }
  [[nodiscard]] const Status& status() const { return slot_.status(); }
  [[nodiscard]] bool package_readable() const { return slot_.package_readable(); }
  [[nodiscard]] std::span<const FamilyAsset> families() const {
    return {package_.families.data(), package_.family_count};
  }
  [[nodiscard]] std::span<const FamilyId> family_catalog() const {
    return {family_catalog_.data(), slot_.status().entry_count};
  }
  [[nodiscard]] std::size_t face_bytes_total() const;
  [[nodiscard]] std::uint32_t payload_crc() const { return payload_crc_; }

  [[nodiscard]] UpdateError begin_update(const std::size_t package_size) {
    return slot_.begin_update(package_size);
  }
  [[nodiscard]] UpdateError write_update(const std::span<const std::uint8_t> bytes) {
    return slot_.write_update(bytes);
  }
  [[nodiscard]] UpdateError commit_update() { return slot_.commit_update(); }
  [[nodiscard]] UpdateError clear() { return slot_.clear(); }
  void cancel_update() { slot_.cancel_update(); }

 private:
  struct ParsedPackage {
    std::uint16_t family_count{};
    std::uint32_t package_size{};
    std::uint32_t payload_crc{};
    std::array<FamilyAsset, kMaximumFamilies> families{};
  };

  [[nodiscard]] bool validate_package(std::span<const std::uint8_t> storage_bytes,
                                      std::span<const std::uint8_t> header_override,
                                      ParsedPackage& parsed) const;

  static bool validate_entry(void* kind, std::span<const std::uint8_t> storage_bytes,
                             std::span<const std::uint8_t> header_override);
  static void publish_entry(void* kind, Status& status);
  static void discard_entry(void* kind);
  static void forget_entry(void* kind);

  asset_package::Slot slot_;
  std::uint32_t payload_crc_{};
  ParsedPackage package_{};
  std::array<FamilyId, kMaximumFamilies> family_catalog_{};
};

using asset_package::update_error_name;

}
