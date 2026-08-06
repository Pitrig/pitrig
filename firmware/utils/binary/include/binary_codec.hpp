#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

namespace simcore::binary {

// Callers validate the containing record before decoding fixed offsets.
[[nodiscard]] inline std::uint16_t read_u16_le(
    const std::span<const std::uint8_t> input, const std::size_t offset) {
  return static_cast<std::uint16_t>(input[offset]) |
         static_cast<std::uint16_t>(input[offset + 1]) << 8U;
}

[[nodiscard]] inline std::uint32_t read_u32_le(
    const std::span<const std::uint8_t> input, const std::size_t offset) {
  std::uint32_t value{};
  for (std::size_t index = 0; index < 4; ++index) {
    value |= static_cast<std::uint32_t>(input[offset + index])
             << (index * 8U);
  }
  return value;
}

inline void write_u16_le(const std::span<std::uint8_t> output,
                         const std::size_t offset,
                         const std::uint16_t value) {
  output[offset] = static_cast<std::uint8_t>(value);
  output[offset + 1] = static_cast<std::uint8_t>(value >> 8U);
}

inline void write_u32_le(const std::span<std::uint8_t> output,
                         const std::size_t offset,
                         const std::uint32_t value) {
  for (std::size_t index = 0; index < 4; ++index) {
    output[offset + index] =
        static_cast<std::uint8_t>(value >> (index * 8U));
  }
}

}  // namespace simcore::binary
