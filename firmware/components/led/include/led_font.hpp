#pragma once

#include <cstddef>
#include <cstdint>

#include "led_font_generated.hpp"

namespace simcore::led {

enum class Font : std::uint8_t { small, large };

[[nodiscard]] constexpr std::uint8_t font_width(const Font font) {
  return font == Font::large ? kLargeWidth : kSmallWidth;
}

[[nodiscard]] constexpr std::uint8_t font_height(const Font font) {
  return font == Font::large ? kLargeHeight : kSmallHeight;
}

[[nodiscard]] std::uint8_t glyph_row(Font font, char character, std::uint8_t row);

[[nodiscard]] std::size_t text_width(Font font, std::size_t characters);

}
