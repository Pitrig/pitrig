#pragma once

#include <array>
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
  [[nodiscard]] bool map(
      Slot slot, std::span<const std::uint8_t>& bytes) override;
  void unmap(Slot slot) override;
  [[nodiscard]] bool erase(Slot slot) override;
  [[nodiscard]] bool write(
      Slot slot, std::size_t offset,
      std::span<const std::uint8_t> bytes) override;

 private:
  struct Mapping {
    const std::uint8_t* address{};
    esp_partition_mmap_handle_t handle{};
  };

  [[nodiscard]] static std::size_t index(Slot slot);

  std::array<const esp_partition_t*, 2> partitions_{};
  std::array<Mapping, 2> mappings_{};
};

}  // namespace simcore::font_assets
