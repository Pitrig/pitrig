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
  /**
   * Makes the buffer at least `size` bytes, keeping what is already there when
   * it is big enough. Growing frees the old block first, so nothing may point
   * into it — and it only ever grows, so a buffer that has held a big
   * configuration keeps room for one rather than trading a smaller block back
   * and forth and fragmenting external RAM as it goes.
   */
  [[nodiscard]] bool ensure(std::size_t size);
  [[nodiscard]] std::span<std::uint8_t> bytes() { return {data_, size_}; }

 private:
  std::uint8_t* data_{};
  std::size_t size_{};
};

}  // namespace simcore::platform
