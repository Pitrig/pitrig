#pragma once

#include <cstdint>
#include <span>

namespace simcore::binary {

[[nodiscard]] std::uint32_t crc32(std::span<const std::uint8_t> bytes);

}  // namespace simcore::binary
