#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "font_asset_types.hpp"

namespace simcore::font_assets {

inline constexpr std::size_t kStorageSize = 2U * 1024U * 1024U;
inline constexpr std::size_t kHeaderSize = 32;
inline constexpr std::size_t kManifestEntrySize = 48;
inline constexpr std::size_t kAssetDataOffset = 4096;
inline constexpr std::uint16_t kFormatVersion = 3;

class IStorage {
 public:
  virtual ~IStorage() = default;

  [[nodiscard]] virtual bool initialize() = 0;
  [[nodiscard]] virtual bool map(std::span<const std::uint8_t>& bytes) = 0;
  virtual void unmap() = 0;
  [[nodiscard]] virtual bool erase() = 0;
  [[nodiscard]] virtual bool write(
      std::size_t offset, std::span<const std::uint8_t> bytes) = 0;
};

// Spans the mapped package. The mapping is released by the next update, so a
// consumer that outlives one boot phase must copy the bytes it needs.
struct FamilyAsset {
  FamilyId family{};
  std::span<const std::uint8_t> bytes{};
};

struct Status {
  bool storage_available{};
  bool package_available{};
  bool reboot_required{};
  std::uint16_t format_version{};
  std::uint16_t family_count{};
  std::uint32_t package_size{};
};

enum class UpdateError : std::uint8_t {
  none,
  unavailable,
  busy,
  invalid_size,
  invalid_state,
  invalid_package,
  reboot_required,
  storage_failure,
};

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
    return {family_catalog_.data(), status_.family_count};
  }
  [[nodiscard]] const FamilyAsset* find(const FamilyId& family) const;
  // Bytes a consumer must reserve to copy every face out of the mapping, each
  // face aligned to four bytes.
  [[nodiscard]] std::size_t face_bytes_total() const;

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
  std::span<const std::uint8_t> package_mapping_{};
  // Indexes the active mapping at boot and acts as update-validation scratch
  // after that mapping has been released.
  ParsedPackage package_{};
  std::array<FamilyId, kMaximumFamilies> family_catalog_{};

  bool update_in_progress_{};
  std::size_t update_size_{};
  std::size_t update_received_{};
  std::array<std::uint8_t, kHeaderSize> update_header_{};
};

[[nodiscard]] const char* update_error_name(UpdateError error);

}  // namespace simcore::font_assets
