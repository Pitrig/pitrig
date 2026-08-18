#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "asset_package.hpp"
#include "asset_storage.hpp"
#include "image_asset_types.hpp"

namespace simcore::image_assets {

inline constexpr std::size_t kStorageSize = 4U * 1024U * 1024U;
inline constexpr std::size_t kHeaderSize = asset_package::kHeaderSize;
inline constexpr std::size_t kManifestEntrySize = 64;
inline constexpr std::size_t kAssetDataOffset = 4096;
inline constexpr std::uint16_t kFormatVersion = 1;

using IStorage = asset_storage::IStorage;

// One image inside the mapped package. The mapping is released by the next
// update, so a consumer that outlives one boot phase must copy the bytes.
struct ImageAsset {
  ImageId id{};
  ColorFormat format{};
  std::uint16_t width{};
  std::uint16_t height{};
  std::uint16_t stride{};
  std::uint16_t palette_count{};
  std::span<const std::uint8_t> bytes{};
};

// What the device reports about an installed image. The mapping is released by
// the next update, so the catalog carries the geometry rather than a span: the
// configurator needs it to decide whether what is installed still fits the
// dashboard, and that answer must survive the mapping.
struct ImageInfo {
  ImageId id{};
  ColorFormat format{};
  std::uint16_t width{};
  std::uint16_t height{};
};

using Status = asset_package::Status;
using UpdateError = asset_package::UpdateError;


/**
 * The uploaded image package: parse, validate, and replace as a whole. The
 * format mirrors the font package deliberately — the same header, the same
 * header-written-last commit, the same reboot before a new package is used —
 * because the risky parts are the flash choreography rather than the pixels.
 *
 * What differs is the manifest entry, which carries geometry: a face describes
 * itself, a bitmap does not, so width, height, colour format and stride are
 * validated here rather than discovered inside a draw.
 */
class Service final {
 public:
  Service() = default;
  ~Service();
  Service(const Service&) = delete;
  Service& operator=(const Service&) = delete;

  [[nodiscard]] bool initialize(IStorage& storage);
  [[nodiscard]] const Status& status() const { return status_; }
  [[nodiscard]] std::span<const ImageAsset> images() const {
    return {package_.images.data(), package_.image_count};
  }
  [[nodiscard]] std::span<const ImageInfo> image_catalog() const {
    return {image_catalog_.data(), status_.entry_count};
  }
  /** Bytes a consumer must reserve to copy every image, each one aligned. */
  [[nodiscard]] std::size_t image_bytes_total() const;

  [[nodiscard]] UpdateError begin_update(std::size_t package_size);
  [[nodiscard]] UpdateError write_update(std::span<const std::uint8_t> bytes);
  [[nodiscard]] UpdateError commit_update();
  [[nodiscard]] UpdateError clear();
  void cancel_update();

 private:
  struct ParsedPackage {
    std::uint16_t image_count{};
    std::uint32_t package_size{};
    std::array<ImageAsset, kMaximumImages> images{};
  };

  [[nodiscard]] bool validate_package(
      std::span<const std::uint8_t> storage_bytes,
      std::span<const std::uint8_t> header_override, ParsedPackage& parsed) const;
  void clear_package_status();
  void reset_update();

  IStorage* storage_{};
  Status status_{};
  std::span<const std::uint8_t> package_mapping_{};
  ParsedPackage package_{};
  std::array<ImageInfo, kMaximumImages> image_catalog_{};

  bool update_in_progress_{};
  std::size_t update_size_{};
  std::size_t update_received_{};
  std::array<std::uint8_t, kHeaderSize> update_header_{};
};

using asset_package::update_error_name;

[[nodiscard]] const char* color_format_name(ColorFormat format);

}  // namespace simcore::image_assets
