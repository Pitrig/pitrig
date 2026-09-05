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
  Service() = default;
  ~Service();
  Service(const Service&) = delete;
  Service& operator=(const Service&) = delete;

  [[nodiscard]] bool initialize(IStorage& storage);
  [[nodiscard]] const Status& status() const { return status_; }
  [[nodiscard]] std::span<const FamilyAsset> families() const {
    return {package_.families.data(), package_.family_count};
  }
  [[nodiscard]] std::span<const FamilyId> family_catalog() const {
    return {family_catalog_.data(), status_.entry_count};
  }
  [[nodiscard]] std::size_t face_bytes_total() const;
  [[nodiscard]] std::uint32_t payload_crc() const { return payload_crc_; }

  [[nodiscard]] UpdateError begin_update(std::size_t package_size);
  [[nodiscard]] UpdateError write_update(
      std::span<const std::uint8_t> bytes);
  [[nodiscard]] UpdateError commit_update();
  [[nodiscard]] UpdateError clear();
  void cancel_update();

 private:
  struct ParsedPackage {
    std::uint16_t family_count{};
    std::uint32_t package_size{};
    std::uint32_t payload_crc{};
    std::array<FamilyAsset, kMaximumFamilies> families{};
  };

  [[nodiscard]] bool validate_package(
      std::span<const std::uint8_t> storage_bytes,
      std::span<const std::uint8_t> header_override,
      ParsedPackage& parsed) const;
  void clear_package_status();
  void reset_update();

  IStorage* storage_{};
  Status status_{};
  std::uint32_t payload_crc_{};
  std::span<const std::uint8_t> package_mapping_{};
  ParsedPackage package_{};
  std::array<FamilyId, kMaximumFamilies> family_catalog_{};

  bool update_in_progress_{};
  std::size_t update_size_{};
  std::size_t update_received_{};
  std::array<std::uint8_t, kHeaderSize> update_header_{};
};

using asset_package::update_error_name;

}
