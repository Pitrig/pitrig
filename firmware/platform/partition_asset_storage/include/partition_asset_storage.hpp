#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "asset_storage.hpp"
#include "esp_partition.h"

namespace simcore::platform {

// One data partition as asset storage. The label and the size it must have are
// given by whoever owns the partition, so a second asset kind is a second
// instance rather than a second class.
class PartitionStorage final : public asset_storage::IStorage {
 public:
  PartitionStorage(const char* label, std::size_t expected_size)
      : label_(label), expected_size_(expected_size) {}
  ~PartitionStorage() override;
  PartitionStorage(const PartitionStorage&) = delete;
  PartitionStorage& operator=(const PartitionStorage&) = delete;

  [[nodiscard]] bool initialize() override;
  [[nodiscard]] bool map(std::span<const std::uint8_t>& bytes) override;
  void unmap() override;
  [[nodiscard]] bool erase() override;
  [[nodiscard]] bool write(std::size_t offset,
                           std::span<const std::uint8_t> bytes) override;

 private:
  struct Mapping {
    const std::uint8_t* address{};
    esp_partition_mmap_handle_t handle{};
  };

  const char* label_{};
  std::size_t expected_size_{};
  const esp_partition_t* partition_{};
  Mapping mapping_{};
};

}  // namespace simcore::platform
