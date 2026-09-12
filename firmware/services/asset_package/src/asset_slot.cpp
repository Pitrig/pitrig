#include <algorithm>

#include "asset_package.hpp"
#include "binary_codec.hpp"

namespace pitrig::asset_package {

Slot::Slot(const SlotOperations& operations, const std::size_t data_offset,
           const std::size_t storage_size)
    : operations_(operations),
      data_offset_(data_offset),
      storage_size_(storage_size),
      mutex_(xSemaphoreCreateRecursiveMutexStatic(&mutex_state_)) {}

Slot::~Slot() {
  if (storage_ != nullptr) {
    storage_->unmap();
  }
}

void Slot::lock() const {
  if (mutex_ != nullptr) {
    (void)xSemaphoreTakeRecursive(mutex_, portMAX_DELAY);
  }
}

void Slot::unlock() const {
  if (mutex_ != nullptr) {
    (void)xSemaphoreGiveRecursive(mutex_);
  }
}

void Slot::release_package() {
  mapping_ = {};
  status_.package_available = false;
  status_.reboot_required = false;
  status_.format_version = 0;
  status_.entry_count = 0;
  status_.package_size = 0;
  operations_.discard(operations_.kind);
  operations_.forget(operations_.kind);
}

void Slot::reset_update() {
  update_in_progress_ = false;
  update_size_ = 0;
  update_received_ = 0;
  update_header_.fill(0xFFU);
}

bool Slot::open(asset_storage::IStorage& storage) {
  const Guard guard{*this};
  if (storage_ != nullptr) {
    storage_->unmap();
  }
  storage_ = &storage;
  status_ = {};
  release_package();
  reset_update();
  status_.storage_available = storage.initialize();
  if (!status_.storage_available) {
    return false;
  }
  if (!storage.map(mapping_)) {
    mapping_ = {};
    return false;
  }
  if (!operations_.validate(operations_.kind, mapping_, {})) {
    storage.unmap();
    release_package();
    return true;
  }
  status_.package_available = true;
  operations_.publish(operations_.kind, status_);
  return true;
}

UpdateError Slot::begin_update(const std::size_t package_size) {
  const Guard guard{*this};
  if (storage_ == nullptr || !status_.storage_available) {
    return UpdateError::unavailable;
  }
  if (update_in_progress_) {
    return UpdateError::busy;
  }
  if (status_.reboot_required) {
    return UpdateError::reboot_required;
  }
  if (package_size < data_offset_ || package_size > storage_size_) {
    return UpdateError::invalid_size;
  }
  storage_->unmap();
  release_package();
  if (!storage_->erase(package_size)) {
    return UpdateError::storage_failure;
  }
  update_in_progress_ = true;
  update_size_ = package_size;
  update_received_ = 0;
  update_header_.fill(0xFFU);
  return UpdateError::none;
}

UpdateError Slot::write_update(const std::span<const std::uint8_t> bytes) {
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
    std::copy_n(bytes.begin(), header_bytes, update_header_.begin() + update_received_);
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

UpdateError Slot::commit_update() {
  const Guard guard{*this};
  if (!update_in_progress_ || update_received_ != update_size_) {
    return UpdateError::invalid_state;
  }
  operations_.discard(operations_.kind);
  std::span<const std::uint8_t> candidate;
  if (!storage_->map(candidate)) {
    return UpdateError::storage_failure;
  }
  const bool valid = operations_.validate(operations_.kind, candidate, update_header_);
  storage_->unmap();
  if (!valid || binary::read_u32_le(update_header_, kHeaderPayloadSizeOffset) != update_size_) {
    release_package();
    reset_update();
    return UpdateError::invalid_package;
  }
  if (!storage_->write(0, update_header_)) {
    release_package();
    reset_update();
    return UpdateError::storage_failure;
  }

  candidate = {};
  if (!storage_->map(candidate) || !operations_.validate(operations_.kind, candidate, {})) {
    storage_->unmap();
    (void)storage_->erase(kHeaderSize);
    release_package();
    reset_update();
    return UpdateError::storage_failure;
  }
  storage_->unmap();
  status_.package_available = true;
  operations_.publish(operations_.kind, status_);
  operations_.discard(operations_.kind);
  reset_update();
  status_.reboot_required = true;
  return UpdateError::none;
}

UpdateError Slot::clear() {
  const Guard guard{*this};
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
  release_package();
  if (!storage_->erase()) {
    return UpdateError::storage_failure;
  }
  status_.reboot_required = true;
  return UpdateError::none;
}

void Slot::cancel_update() {
  const Guard guard{*this};
  if (storage_ != nullptr && update_in_progress_) {
    storage_->unmap();
  }
  reset_update();
}

}
