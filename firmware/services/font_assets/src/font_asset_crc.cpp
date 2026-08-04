#include "font_asset_crc.hpp"

#include <array>
#include <limits>

namespace simcore::font_assets {

std::uint32_t crc32(const std::span<const std::uint8_t> bytes) {
  constexpr std::array<std::uint32_t, 16> kTable{
      0x0000'0000U, 0x1DB7'1064U, 0x3B6E'20C8U, 0x26D9'30ACU,
      0x76DC'4190U, 0x6B6B'51F4U, 0x4DB2'6158U, 0x5005'713CU,
      0xEDB8'8320U, 0xF00F'9344U, 0xD6D6'A3E8U, 0xCB61'B38CU,
      0x9B64'C2B0U, 0x86D3'D2D4U, 0xA00A'E278U, 0xBDBD'F21CU,
  };
  std::uint32_t crc = std::numeric_limits<std::uint32_t>::max();
  for (const std::uint8_t byte : bytes) {
    crc ^= byte;
    crc = (crc >> 4U) ^ kTable[crc & 0x0FU];
    crc = (crc >> 4U) ^ kTable[crc & 0x0FU];
  }
  return ~crc;
}

}  // namespace simcore::font_assets
