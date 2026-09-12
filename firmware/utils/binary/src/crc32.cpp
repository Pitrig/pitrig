#include "crc32.hpp"

#include "esp_rom_crc.h"

namespace pitrig::binary {

void Crc32::update(const std::span<const std::uint8_t> bytes) {
  if (bytes.empty()) {
    return;
  }
  state_ = ~esp_rom_crc32_le(~state_, bytes.data(), static_cast<std::uint32_t>(bytes.size()));
}

std::uint32_t crc32(const std::span<const std::uint8_t> bytes) {
  Crc32 accumulator;
  accumulator.update(bytes);
  return accumulator.value();
}

}
