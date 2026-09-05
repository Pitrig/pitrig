#include "font_asset_service.hpp"

#include <algorithm>
#include <array>
#include <string_view>

#include "binary_codec.hpp"
#include "crc32.hpp"

namespace pitrig::font_assets {

Service::~Service() {
  if (storage_ != nullptr) {
    storage_->unmap();
  }
}

bool Service::initialize(IStorage& storage) {
  if (storage_ != nullptr) {
    storage_->unmap();
  }
  storage_ = &storage;
  status_ = {};
  package_mapping_ = {};
  package_ = {};
  family_catalog_ = {};
  reset_update();
  status_.storage_available = storage.initialize();
  if (!status_.storage_available) {
    return false;
  }

  if (!storage.map(package_mapping_)) {
    return false;
  }
  if (!validate_package(package_mapping_, {}, package_)) {
    storage.unmap();
    package_mapping_ = {};
    package_ = {};
    return true;
  }

  status_.package_available = true;
  status_.format_version = kFormatVersion;
  status_.entry_count = package_.family_count;
  status_.package_size = package_.package_size;
  payload_crc_ = package_.payload_crc;
  for (std::size_t index = 0; index < package_.family_count; ++index) {
    family_catalog_[index] = package_.families[index].family;
  }
  return true;
}

std::size_t Service::face_bytes_total() const {
  std::size_t total{};
  for (const FamilyAsset& asset : families()) {
    total += (asset.bytes.size() + kFaceAlignment - 1) & ~(kFaceAlignment - 1);
  }
  return total;
}

UpdateError Service::begin_update(const std::size_t package_size) {
  if (storage_ == nullptr || !status_.storage_available) {
    return UpdateError::unavailable;
  }
  if (update_in_progress_) {
    return UpdateError::busy;
  }
  if (status_.reboot_required) {
    return UpdateError::reboot_required;
  }
  if (package_size < kAssetDataOffset || package_size > kStorageSize) {
    return UpdateError::invalid_size;
  }
  storage_->unmap();
  package_mapping_ = {};
  package_ = {};
  clear_package_status();
  if (!storage_->erase(package_size)) {
    return UpdateError::storage_failure;
  }
  update_in_progress_ = true;
  update_size_ = package_size;
  update_received_ = 0;
  update_header_.fill(0xFFU);
  return UpdateError::none;
}

UpdateError Service::write_update(
    const std::span<const std::uint8_t> bytes) {
  if (!update_in_progress_) {
    return UpdateError::invalid_state;
  }
  if (bytes.empty() || bytes.size() > update_size_ - update_received_) {
    return UpdateError::invalid_size;
  }

  std::size_t source_offset{};
  if (update_received_ < update_header_.size()) {
    const std::size_t header_bytes =
        std::min(bytes.size(), update_header_.size() - update_received_);
    std::copy_n(bytes.begin(), header_bytes,
                update_header_.begin() + update_received_);
    source_offset = header_bytes;
    update_received_ += header_bytes;
  }
  if (source_offset < bytes.size()) {
    const auto body = bytes.subspan(source_offset);
    if (!storage_->write(update_received_, body)) {
      reset_update();
      return UpdateError::storage_failure;
    }
    update_received_ += body.size();
  }
  return UpdateError::none;
}

UpdateError Service::commit_update() {
  if (!update_in_progress_ || update_received_ != update_size_) {
    return UpdateError::invalid_state;
  }

  package_ = {};
  std::span<const std::uint8_t> candidate_mapping;
  if (!storage_->map(candidate_mapping)) {
    return UpdateError::storage_failure;
  }
  const bool valid =
      validate_package(candidate_mapping, update_header_, package_);
  storage_->unmap();
  if (!valid ||
      binary::read_u32_le(update_header_,
                          asset_package::kHeaderPayloadSizeOffset) !=
          update_size_) {
    package_ = {};
    reset_update();
    return UpdateError::invalid_package;
  }
  if (!storage_->write(0, update_header_)) {
    package_ = {};
    reset_update();
    return UpdateError::storage_failure;
  }

  candidate_mapping = {};
  if (!storage_->map(candidate_mapping) ||
      !validate_package(candidate_mapping, {}, package_)) {
    storage_->unmap();
    package_ = {};
    reset_update();
    return UpdateError::storage_failure;
  }
  storage_->unmap();
  status_.package_available = true;
  status_.format_version = kFormatVersion;
  status_.entry_count = package_.family_count;
  status_.package_size = package_.package_size;
  payload_crc_ = package_.payload_crc;
  family_catalog_ = {};
  for (std::size_t index = 0; index < package_.family_count; ++index) {
    family_catalog_[index] = package_.families[index].family;
  }
  package_ = {};
  reset_update();
  status_.reboot_required = true;
  return UpdateError::none;
}

UpdateError Service::clear() {
  if (storage_ == nullptr || !status_.storage_available) {
    return UpdateError::unavailable;
  }
  if (update_in_progress_) {
    return UpdateError::busy;
  }
  if (status_.reboot_required) {
    return UpdateError::reboot_required;
  }
  storage_->unmap();
  package_mapping_ = {};
  package_ = {};
  clear_package_status();
  if (!storage_->erase()) {
    return UpdateError::storage_failure;
  }
  status_.reboot_required = true;
  return UpdateError::none;
}

void Service::cancel_update() {
  if (storage_ != nullptr && update_in_progress_) {
    storage_->unmap();
  }
  reset_update();
}

void Service::clear_package_status() {
  status_.package_available = false;
  status_.reboot_required = false;
  status_.format_version = 0;
  status_.entry_count = 0;
  status_.package_size = 0;
  payload_crc_ = 0;
  family_catalog_ = {};
}

void Service::reset_update() {
  update_in_progress_ = false;
  update_size_ = 0;
  update_received_ = 0;
  update_header_.fill(0xFFU);
}

}
