#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

namespace pitrig::asset_storage {

class IStorage {
 public:
  virtual ~IStorage() = default;

  [[nodiscard]] virtual bool initialize() = 0;
  [[nodiscard]] virtual bool map(std::span<const std::uint8_t>& bytes) = 0;
  virtual void unmap() = 0;
  [[nodiscard]] virtual bool erase() = 0;
  [[nodiscard]] virtual bool erase(std::size_t bytes) = 0;
  [[nodiscard]] virtual bool write(std::size_t offset,
                                   std::span<const std::uint8_t> bytes) = 0;
};

}
