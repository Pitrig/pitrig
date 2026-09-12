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

namespace pitrig::firmware_update {

inline constexpr std::uint32_t kMagic = 0x5746'4353U;
inline constexpr std::uint16_t kFormatVersion = 1;
inline constexpr std::uint16_t kManifestEntryCount = 1;
inline constexpr std::size_t kManifestEntrySize = 2;
inline constexpr std::size_t kImageOffset = 64;

using UpdateError = asset_package::UpdateError;
using asset_package::update_error_name;

struct Status {
  bool available{};
  bool reboot_required{};
  bool pending_verify{};
  std::string_view running{};
  std::string_view target{};
  std::string_view version{};
};

class Service final {
 public:
  Service() = default;
  ~Service();
  Service(const Service&) = delete;
  Service& operator=(const Service&) = delete;

  [[nodiscard]] bool initialize(configuration::BoardId board);
  [[nodiscard]] const Status& status() const { return status_; }

  void mark_running_image_valid();

  [[nodiscard]] UpdateError begin_update(std::size_t package_size);
  [[nodiscard]] UpdateError write_update(std::span<const std::uint8_t> bytes);
  [[nodiscard]] UpdateError commit_update();
  [[nodiscard]] UpdateError clear() const;
  void cancel_update();

 private:
  [[nodiscard]] UpdateError consume_header(std::span<const std::uint8_t>& bytes);
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

}
