#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

#include "application_configuration_generated.hpp"
#include "asset_package.hpp"
#include "crc32.hpp"
#include "esp_ota_ops.h"
#include "esp_partition.h"

namespace simcore::firmware_update {

// A firmware image arrives in the same 32-byte package header the font and
// image kinds use, so the three formats stay readable side by side, and over
// the same `SCF1` frames. What differs is the manifest: one entry naming the
// board the image was built for. That entry is the whole reason for wrapping a
// plain application image at all — ESP-IDF rejects an image built for another
// chip, but the T-Display-S3 and the Guition 4848S040 are both ESP32-S3, and an
// image swapped between them boots with the wrong display driver.
inline constexpr std::uint32_t kMagic = 0x5746'4353U;  // "SCFW", little endian
inline constexpr std::uint16_t kFormatVersion = 1;
inline constexpr std::uint16_t kManifestEntryCount = 1;
inline constexpr std::size_t kManifestEntrySize = 2;
// Where the application image starts. Padded well past the one manifest entry
// for the same reason the other kinds pad: a later format may describe more
// without moving the payload.
inline constexpr std::size_t kImageOffset = 64;

using UpdateError = asset_package::UpdateError;
using asset_package::update_error_name;

// What the device reports about firmware slots. Every view points at storage
// that outlives the service: partition labels live in the partition table
// cache, and the version string inside the running image's description.
struct Status {
  // False only when the running build has no second slot to update into, which
  // means a partition table without OTA.
  bool available{};
  // An image is staged and selected; it runs after the next reset.
  bool reboot_required{};
  // The running image still has to prove itself. Left set at a reset, the
  // bootloader restores the previous slot.
  bool pending_verify{};
  std::string_view running{};
  std::string_view target{};
  std::string_view version{};
};

// Receives one uploaded application image into the inactive OTA slot. The
// bytes are streamed into flash as they arrive; nothing but the package header
// is ever held whole.
class Service final {
 public:
  Service() = default;
  ~Service();
  Service(const Service&) = delete;
  Service& operator=(const Service&) = delete;

  // `board` is the identity this build was compiled for. It is passed in rather
  // than read from the board registry because that registry is platform code,
  // which a service may not depend on.
  [[nodiscard]] bool initialize(configuration::BoardId board);
  [[nodiscard]] const Status& status() const { return status_; }

  // Cancels the rollback a freshly installed image boots under. Startup calls
  // it once the image has shown it can run; until then a reset returns the
  // device to the slot it came from.
  void mark_running_image_valid();

  [[nodiscard]] UpdateError begin_update(std::size_t package_size);
  [[nodiscard]] UpdateError write_update(std::span<const std::uint8_t> bytes);
  [[nodiscard]] UpdateError commit_update();
  // There is no firmware to erase: the only images on the device are the one
  // running and the one it would fall back to.
  [[nodiscard]] UpdateError clear() const;
  void cancel_update();

 private:
  // Consumes as much of `bytes` as the held-back header still needs. Once the
  // header is complete it is validated and the OTA write handle is opened, so
  // an image for another board never reaches flash.
  [[nodiscard]] UpdateError consume_header(
      std::span<const std::uint8_t>& bytes);
  [[nodiscard]] UpdateError open_target();
  void reset_update();

  configuration::BoardId board_{};
  Status status_{};
  const esp_partition_t* target_{};
  esp_ota_handle_t handle_{};
  bool handle_open_{};
  bool update_in_progress_{};
  std::size_t update_size_{};
  std::size_t update_received_{};
  std::uint32_t expected_image_crc_{};
  binary::Crc32 image_crc_{};
  std::array<std::uint8_t, kImageOffset> header_{};
};

}  // namespace simcore::firmware_update
