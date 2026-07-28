#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

namespace simcore::configuration {

enum class StorageSlot : std::uint8_t { a, b };

class IConfigurationStorage {
 public:
  virtual ~IConfigurationStorage() = default;

  virtual bool initialize() = 0;
  virtual bool read(StorageSlot slot, std::span<std::uint8_t> destination,
                    std::size_t& size) = 0;
  virtual bool write(StorageSlot slot, std::span<const std::uint8_t> data) = 0;
  virtual bool read_active(StorageSlot& slot) = 0;
  virtual bool set_active(StorageSlot slot) = 0;
  virtual bool reset() = 0;
};

}  // namespace simcore::configuration
