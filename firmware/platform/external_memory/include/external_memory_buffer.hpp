#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

namespace simcore::platform {

// Owns one firmware-lifetime byte buffer in external RAM. Allocation is
// explicit and limited to startup; periodic paths only use non-owning spans.
class ExternalMemoryBuffer final {
 public:
  ExternalMemoryBuffer() = default;
  ~ExternalMemoryBuffer();

  ExternalMemoryBuffer(const ExternalMemoryBuffer&) = delete;
  ExternalMemoryBuffer& operator=(const ExternalMemoryBuffer&) = delete;

  [[nodiscard]] bool initialize(std::size_t size);
  [[nodiscard]] std::span<std::uint8_t> bytes() { return {data_, size_}; }

 private:
  std::uint8_t* data_{};
  std::size_t size_{};
};

}  // namespace simcore::platform
