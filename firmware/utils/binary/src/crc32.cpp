#include "crc32.hpp"

namespace simcore::binary {

std::uint32_t crc32(const std::span<const std::uint8_t> bytes) {
  std::uint32_t crc = 0xFFFF'FFFFU;
  for (const std::uint8_t value : bytes) {
    crc ^= value;
    for (std::uint8_t bit = 0; bit < 8; ++bit) {
      const std::uint32_t mask =
          0U - static_cast<std::uint32_t>(crc & 1U);
      crc = (crc >> 1U) ^ (0xEDB8'8320U & mask);
    }
  }
  return ~crc;
}

}  // namespace simcore::binary
