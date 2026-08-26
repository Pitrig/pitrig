#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "asset_package.hpp"
#include "asset_storage.hpp"
#include "image_asset_types.hpp"

namespace simcore::image_assets {

inline constexpr std::size_t kStorageSize = 7U * 1024U * 1024U;
inline constexpr std::size_t kHeaderSize = asset_package::kHeaderSize;
inline constexpr std::size_t kManifestEntrySize = 64;
inline constexpr std::size_t kAssetDataOffset = 4096;
inline constexpr std::uint16_t kFormatVersion = 2;
inline constexpr std::uint16_t kMinimumFormatVersion = 1;

using IStorage = asset_storage::IStorage;

struct ImageAsset {
  ImageId id{};
  ColorFormat format{};
  Compression compression{};
  std::uint16_t width{};
  std::uint16_t height{};
  std::uint16_t stride{};
  std::uint16_t frame_count{1};
  std::span<const std::uint8_t> bytes{};
  [[nodiscard]] std::size_t frame_stride() const {
    return frame_bytes(format, width, height);
  }
  [[nodiscard]] std::size_t decoded_bytes() const {
    return image_bytes(format, width, height, frame_count);
  }
};

struct ImageInfo {
  ImageId id{};
  ColorFormat format{};
  std::uint16_t width{};
  std::uint16_t height{};
  std::uint16_t frame_count{1};
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
  [[nodiscard]] std::span<const ImageAsset> images() const {
    return {package_.images.data(), package_.image_count};
  }
  [[nodiscard]] std::span<const ImageInfo> image_catalog() const {
    return {image_catalog_.data(), status_.entry_count};
  }
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

}
