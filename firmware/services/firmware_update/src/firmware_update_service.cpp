#include "firmware_update_service.hpp"

#include <algorithm>

#include "binary_codec.hpp"
#include "esp_app_desc.h"
#include "esp_err.h"

namespace pitrig::firmware_update {
namespace {

[[nodiscard]] std::string_view label_of(const esp_partition_t* const partition) {
  return partition == nullptr ? std::string_view{}
                              : std::string_view{partition->label};
}

}

Service::~Service() { cancel_update(); }

bool Service::initialize(const configuration::BoardId board) {
  board_ = board;
  status_ = {};
  target_ = esp_ota_get_next_update_partition(nullptr);
  const esp_partition_t* const running = esp_ota_get_running_partition();
  status_.available = target_ != nullptr;
  status_.running = label_of(running);
  status_.target = label_of(target_);
  if (const esp_app_desc_t* const description = esp_app_get_description();
      description != nullptr) {
    status_.version = description->version;
  }
  esp_ota_img_states_t state{};
  if (running != nullptr &&
      esp_ota_get_state_partition(running, &state) == ESP_OK) {
    status_.pending_verify = state == ESP_OTA_IMG_PENDING_VERIFY;
  }
  return status_.available;
}

void Service::mark_running_image_valid() {
  if (!status_.pending_verify) {
    return;
  }
  if (esp_ota_mark_app_valid_cancel_rollback() == ESP_OK) {
    status_.pending_verify = false;
  }
}

UpdateError Service::begin_update(const std::size_t package_size) {
  if (target_ == nullptr) {
    return UpdateError::unavailable;
  }
  if (update_in_progress_) {
    return UpdateError::busy;
  }
  if (status_.reboot_required) {
    return UpdateError::reboot_required;
  }
  if (package_size <= kImageOffset ||
      package_size - kImageOffset > target_->size) {
    return UpdateError::invalid_size;
  }
  update_in_progress_ = true;
  update_size_ = package_size;
  update_received_ = 0;
  expected_image_crc_ = 0;
  image_crc_.reset();
  header_.fill(0);
  return UpdateError::none;
}

UpdateError Service::consume_header(std::span<const std::uint8_t>& bytes) {
  if (update_received_ >= header_.size()) {
    return UpdateError::none;
  }
  const std::size_t wanted =
      std::min(bytes.size(), header_.size() - update_received_);
  std::copy_n(bytes.begin(), wanted, header_.begin() + update_received_);
  update_received_ += wanted;
  bytes = bytes.subspan(wanted);
  if (update_received_ < header_.size()) {
    return UpdateError::none;
  }
  return open_target();
}

UpdateError Service::open_target() {
  const std::span<const std::uint8_t> header{header_};
  const std::uint16_t entry_count =
      binary::read_u16_le(header, asset_package::kHeaderEntryCountOffset);
  const std::uint32_t package_size =
      binary::read_u32_le(header, asset_package::kHeaderPayloadSizeOffset);
  if (binary::read_u32_le(header, asset_package::kHeaderMagicOffset) != kMagic ||
      binary::read_u16_le(header, asset_package::kHeaderFormatVersionOffset) !=
          kFormatVersion ||
      binary::read_u16_le(header, asset_package::kHeaderSizeOffset) !=
          asset_package::kHeaderSize ||
      binary::read_u32_le(header, asset_package::kHeaderReservedWordOffset) !=
          0 ||
      entry_count != kManifestEntryCount ||
      binary::read_u16_le(header, asset_package::kHeaderReservedOffset) != 0 ||
      package_size != update_size_ ||
      binary::read_u32_le(header, asset_package::kHeaderCrcOffset) !=
          binary::crc32(header.first(asset_package::kHeaderCrcOffset))) {
    return UpdateError::invalid_package;
  }

  const auto manifest = header.subspan(asset_package::kManifestOffset,
                                       kManifestEntryCount * kManifestEntrySize);
  if (binary::read_u32_le(header, asset_package::kHeaderManifestCrcOffset) !=
          binary::crc32(manifest) ||
      binary::read_u16_le(manifest, 0) !=
          static_cast<std::uint16_t>(board_)) {
    return UpdateError::invalid_package;
  }

  expected_image_crc_ =
      binary::read_u32_le(header, asset_package::kHeaderPayloadCrcOffset);
  if (esp_ota_begin(target_, update_size_ - kImageOffset, &handle_) != ESP_OK) {
    return UpdateError::storage_failure;
  }
  handle_open_ = true;
  return UpdateError::none;
}

UpdateError Service::write_update(const std::span<const std::uint8_t> bytes) {
  if (!update_in_progress_) {
    return UpdateError::invalid_state;
  }
  if (bytes.empty() || bytes.size() > update_size_ - update_received_) {
    return UpdateError::invalid_size;
  }
  std::span<const std::uint8_t> body = bytes;
  if (const UpdateError error = consume_header(body);
      error != UpdateError::none) {
    reset_update();
    return error;
  }
  if (body.empty()) {
    return UpdateError::none;
  }
  if (esp_ota_write(handle_, body.data(), body.size()) != ESP_OK) {
    reset_update();
    return UpdateError::storage_failure;
  }
  image_crc_.update(body);
  update_received_ += body.size();
  return UpdateError::none;
}

UpdateError Service::commit_update() {
  if (!update_in_progress_ || !handle_open_ ||
      update_received_ != update_size_) {
    return UpdateError::invalid_state;
  }
  if (image_crc_.value() != expected_image_crc_) {
    reset_update();
    return UpdateError::invalid_package;
  }
  if (esp_ota_end(handle_) != ESP_OK) {
    handle_open_ = false;
    reset_update();
    return UpdateError::invalid_package;
  }
  handle_open_ = false;
  if (esp_ota_set_boot_partition(target_) != ESP_OK) {
    reset_update();
    return UpdateError::storage_failure;
  }
  reset_update();
  status_.reboot_required = true;
  return UpdateError::none;
}

UpdateError Service::clear() const { return UpdateError::invalid_state; }

void Service::cancel_update() { reset_update(); }

void Service::reset_update() {
  if (handle_open_) {
    (void)esp_ota_abort(handle_);
  }
  handle_open_ = false;
  handle_ = {};
  update_in_progress_ = false;
  update_size_ = 0;
  update_received_ = 0;
  expected_image_crc_ = 0;
  image_crc_.reset();
}

}
