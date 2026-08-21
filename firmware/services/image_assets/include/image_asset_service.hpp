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
// 2 added the per-entry compression byte and the frame count, both in fields
// version 1 reserved. A version 1 package is still read — nothing about its
// bytes changed meaning, and a reserved zero reads as "uncompressed, one
// frame" — so a board that already holds one keeps drawing after a firmware
// update.
inline constexpr std::uint16_t kFormatVersion = 2;
inline constexpr std::uint16_t kMinimumFormatVersion = 1;

using IStorage = asset_storage::IStorage;

// One image inside the mapped package. The mapping is released by the next
// update, so a consumer that outlives one boot phase must copy the bytes.
struct ImageAsset {
  ImageId id{};
  ColorFormat format{};
  Compression compression{};
  // Width and height describe one frame, which for an ordinary image is the
  // whole of it.
  std::uint16_t width{};
  std::uint16_t height{};
  std::uint16_t stride{};
  // Frames stored back to back, at least one. More than one makes this a sprite
  // sheet: a widget draws whichever frame it is asked for, and switching costs
  // an offset rather than an upload.
  std::uint16_t frame_count{1};
  // What the package holds — the compressed stream when `compression` says so,
  // which is why it is not the size to reserve for this image.
  std::span<const std::uint8_t> bytes{};
  /** One frame's size in memory, which is also the step between frames. */
  [[nodiscard]] std::size_t frame_stride() const {
    return frame_bytes(format, width, height);
  }
  // What the image occupies once it is in memory, every frame included. Derived
  // from the geometry rather than stored, so a compressed asset and a raw one
  // answer the same.
  [[nodiscard]] std::size_t decoded_bytes() const {
    return image_bytes(format, width, height, frame_count);
  }
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
  std::uint16_t frame_count{1};
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
  /**
   * Whether the package is still mapped, and so whether anything can be loaded
   * out of it. False between an upload's `BEGIN` and the restart it requires:
   * the partition has been erased under a dashboard that is still drawing from
   * copies of what used to be there.
   */
  [[nodiscard]] bool package_readable() const { return !package_mapping_.empty(); }
  [[nodiscard]] UpdateError begin_update(std::size_t package_size);
  [[nodiscard]] UpdateError write_update(std::span<const std::uint8_t> bytes);
  [[nodiscard]] UpdateError commit_update();
  [[nodiscard]] UpdateError clear();
  void cancel_update();

 private:
  struct ParsedPackage {
    std::uint16_t image_count{};
    std::uint16_t format_version{};
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
