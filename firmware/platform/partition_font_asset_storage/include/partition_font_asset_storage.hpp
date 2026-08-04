#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "esp_partition.h"
#include "font_asset_service.hpp"

namespace simcore::font_assets {

class PartitionStorage final : public IStorage {
 public:
  PartitionStorage() = default;
  ~PartitionStorage() override;
  PartitionStorage(const PartitionStorage&) = delete;
  PartitionStorage& operator=(const PartitionStorage&) = delete;

  [[nodiscard]] bool initialize() override;
  [[nodiscard]] bool map(std::span<const std::uint8_t>& bytes) override;
  void unmap() override;
  [[nodiscard]] bool erase() override;
  [[nodiscard]] bool write(
      std::size_t offset, std::span<const std::uint8_t> bytes) override;

 private:
  struct Mapping {
    const std::uint8_t* address{};
    esp_partition_mmap_handle_t handle{};
  };

  const esp_partition_t* partition_{};
  Mapping mapping_{};
};

}  // namespace simcore::font_assets
