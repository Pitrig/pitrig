#pragma once

#include <cstddef>
#include <cstdint>

#include "led_font_generated.hpp"

namespace simcore::led {

enum class Font : std::uint8_t { regular_4x6, bold_4x6, regular_5x8, bold_5x8 };

[[nodiscard]] constexpr const FaceData& face_of(const Font font) {
  const auto index = static_cast<std::size_t>(font);
  return kFaces[index < kFaces.size() ? index : 0];
}

[[nodiscard]] constexpr std::uint8_t font_width(const Font font) {
  return face_of(font).width;
}

[[nodiscard]] constexpr std::uint8_t font_height(const Font font) {
  return face_of(font).height;
}

[[nodiscard]] std::uint16_t glyph_row(Font font, char character, std::uint8_t row);

[[nodiscard]] std::size_t text_width(Font font, std::size_t characters);

}
