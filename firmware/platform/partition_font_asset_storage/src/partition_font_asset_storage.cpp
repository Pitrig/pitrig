#include "partition_font_asset_storage.hpp"

#include "esp_err.h"

namespace simcore::font_assets {
namespace {

constexpr std::array<const char*, 2> kPartitionLabels{"font_a", "font_b"};

}  // namespace

PartitionStorage::~PartitionStorage() {
  unmap(Slot::a);
  unmap(Slot::b);
}

bool PartitionStorage::initialize() {
  unmap(Slot::a);
  unmap(Slot::b);
  for (std::size_t slot_index = 0; slot_index < partitions_.size();
       ++slot_index) {
    partitions_[slot_index] = esp_partition_find_first(
        ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY,
        kPartitionLabels[slot_index]);
    if (partitions_[slot_index] == nullptr ||
        partitions_[slot_index]->size != kSlotSize) {
      partitions_ = {};
      return false;
    }
  }
  return true;
}

bool PartitionStorage::map(const Slot slot,
                           std::span<const std::uint8_t>& bytes) {
  const std::size_t slot_index = index(slot);
  const esp_partition_t* const partition = partitions_[slot_index];
  if (partition == nullptr) {
    return false;
  }
  Mapping& mapping = mappings_[slot_index];
  if (mapping.address == nullptr) {
    const void* address{};
    if (esp_partition_mmap(partition, 0, partition->size,
                           ESP_PARTITION_MMAP_DATA, &address,
                           &mapping.handle) != ESP_OK) {
      return false;
    }
    mapping.address = static_cast<const std::uint8_t*>(address);
  }
  bytes = {mapping.address, partition->size};
  return true;
}

void PartitionStorage::unmap(const Slot slot) {
  Mapping& mapping = mappings_[index(slot)];
  if (mapping.address != nullptr) {
    esp_partition_munmap(mapping.handle);
    mapping = {};
  }
}

bool PartitionStorage::erase(const Slot slot) {
  const std::size_t slot_index = index(slot);
  const esp_partition_t* const partition = partitions_[slot_index];
  if (partition == nullptr) {
    return false;
  }
  unmap(slot);
  return esp_partition_erase_range(partition, 0, partition->size) == ESP_OK;
}

bool PartitionStorage::write(const Slot slot, const std::size_t offset,
                             const std::span<const std::uint8_t> bytes) {
  const std::size_t slot_index = index(slot);
  const esp_partition_t* const partition = partitions_[slot_index];
  if (partition == nullptr || bytes.empty() || offset > partition->size ||
      bytes.size() > partition->size - offset) {
    return false;
  }
  unmap(slot);
  return esp_partition_write(partition, offset, bytes.data(), bytes.size()) ==
         ESP_OK;
}

std::size_t PartitionStorage::index(const Slot slot) {
  return slot == Slot::a ? 0 : 1;
}

}  // namespace simcore::font_assets
