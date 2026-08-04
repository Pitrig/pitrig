#pragma once

#include <cstdint>
#include <span>

namespace simcore::font_assets {

[[nodiscard]] std::uint32_t crc32(std::span<const std::uint8_t> bytes);

}  // namespace simcore::font_assets
