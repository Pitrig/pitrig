#include "crc32.hpp"

namespace pitrig::binary {

void Crc32::update(const std::span<const std::uint8_t> bytes) {
  for (const std::uint8_t value : bytes) {
    state_ ^= value;
    for (std::uint8_t bit = 0; bit < 8; ++bit) {
      const std::uint32_t mask =
          0U - static_cast<std::uint32_t>(state_ & 1U);
      state_ = (state_ >> 1U) ^ (0xEDB8'8320U & mask);
    }
  }
}

std::uint32_t crc32(const std::span<const std::uint8_t> bytes) {
  Crc32 accumulator;
  accumulator.update(bytes);
  return accumulator.value();
}

}
