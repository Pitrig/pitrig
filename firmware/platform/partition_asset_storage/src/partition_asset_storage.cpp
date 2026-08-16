#include "partition_asset_storage.hpp"

#include "esp_err.h"

namespace simcore::platform {

PartitionStorage::~PartitionStorage() { unmap(); }

bool PartitionStorage::initialize() {
  unmap();
  partition_ = esp_partition_find_first(ESP_PARTITION_TYPE_DATA,
                                        ESP_PARTITION_SUBTYPE_ANY, label_);
  // A partition of the wrong size would let a package validate against bounds
  // the firmware does not actually own, so the mismatch is fatal to this store
  // rather than something to work around.
  return partition_ != nullptr && partition_->size == expected_size_;
}

bool PartitionStorage::map(std::span<const std::uint8_t>& bytes) {
  if (partition_ == nullptr) {
    return false;
  }
  if (mapping_.address == nullptr) {
    const void* address{};
    if (esp_partition_mmap(partition_, 0, partition_->size,
                           ESP_PARTITION_MMAP_DATA, &address,
                           &mapping_.handle) != ESP_OK) {
      return false;
    }
    mapping_.address = static_cast<const std::uint8_t*>(address);
  }
  bytes = {mapping_.address, partition_->size};
  return true;
}

void PartitionStorage::unmap() {
  if (mapping_.address != nullptr) {
    esp_partition_munmap(mapping_.handle);
    mapping_ = {};
  }
}

bool PartitionStorage::erase() {
  if (partition_ == nullptr) {
    return false;
  }
  unmap();
  return esp_partition_erase_range(partition_, 0, partition_->size) == ESP_OK;
}

bool PartitionStorage::write(const std::size_t offset,
                             const std::span<const std::uint8_t> bytes) {
  if (partition_ == nullptr || bytes.empty() || offset > partition_->size ||
      bytes.size() > partition_->size - offset) {
    return false;
  }
  unmap();
  return esp_partition_write(partition_, offset, bytes.data(), bytes.size()) ==
         ESP_OK;
}

}  // namespace simcore::platform
