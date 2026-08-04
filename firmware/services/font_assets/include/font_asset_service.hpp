#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "font_asset_types.hpp"

namespace simcore::font_assets {

inline constexpr std::size_t kSlotSize = 2U * 1024U * 1024U;
inline constexpr std::size_t kHeaderSize = 32;
inline constexpr std::size_t kManifestEntrySize = 48;
inline constexpr std::size_t kAssetDataOffset = 4096;
inline constexpr std::size_t kMaximumAssets = 32;
inline constexpr std::uint16_t kFormatVersion = 1;

enum class Slot : std::uint8_t {
  a,
  b,
};

class IStorage {
 public:
  virtual ~IStorage() = default;

  [[nodiscard]] virtual bool initialize() = 0;
  [[nodiscard]] virtual bool map(
      Slot slot, std::span<const std::uint8_t>& bytes) = 0;
  virtual void unmap(Slot slot) = 0;
  [[nodiscard]] virtual bool erase(Slot slot) = 0;
  [[nodiscard]] virtual bool write(
      Slot slot, std::size_t offset,
      std::span<const std::uint8_t> bytes) = 0;
};

struct AssetView {
  FontSpec font{};
  std::span<const std::uint8_t> bytes{};
};

struct Status {
  bool storage_available{};
  bool has_active_slot{};
  bool reboot_required{};
  Slot active_slot{Slot::a};
  std::uint32_t generation{};
  std::uint16_t asset_count{};
};

enum class UpdateError : std::uint8_t {
  none,
  unavailable,
  busy,
  invalid_size,
  invalid_state,
  invalid_package,
  stale_generation,
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
  [[nodiscard]] std::span<const AssetView> assets() const {
    return {assets_.data(), status_.asset_count};
  }
  [[nodiscard]] const AssetView* find(const FontSpec& font) const;

  [[nodiscard]] UpdateError begin_update(std::size_t package_size);
  [[nodiscard]] UpdateError write_update(
      std::span<const std::uint8_t> bytes);
  [[nodiscard]] UpdateError commit_update();
  void cancel_update();

 private:
  struct ParsedSlot {
    std::uint32_t generation{};
    std::uint16_t asset_count{};
    std::array<AssetView, kMaximumAssets> assets{};
  };

  [[nodiscard]] bool inspect_slot(Slot slot, ParsedSlot& parsed);
  [[nodiscard]] bool validate_slot(
      std::span<const std::uint8_t> slot_bytes,
      std::span<const std::uint8_t> header_override,
      ParsedSlot& parsed) const;
  [[nodiscard]] Slot inactive_slot() const;
  void reset_update();

  IStorage* storage_{};
  Status status_{};
  std::array<AssetView, kMaximumAssets> assets_{};
  std::span<const std::uint8_t> active_mapping_{};

  bool update_in_progress_{};
  Slot update_slot_{Slot::a};
  std::size_t update_size_{};
  std::size_t update_received_{};
  std::array<std::uint8_t, kHeaderSize> update_header_{};
};

[[nodiscard]] const char* update_error_name(UpdateError error);

}  // namespace simcore::font_assets
