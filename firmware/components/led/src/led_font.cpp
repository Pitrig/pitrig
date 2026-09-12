#include "led_font.hpp"

namespace pitrig::led {
namespace {

[[nodiscard]] char upper(const char character) {
  return character >= 'a' && character <= 'z' ? static_cast<char>(character - 'a' + 'A')
                                              : character;
}

}

std::uint16_t glyph_row(const Font font, const char character, const std::uint8_t row) {
  const char resolved = upper(character);
  if (resolved < kFirstGlyph || resolved > kLastGlyph || row >= font_height(font)) {
    return 0;
  }
  const std::size_t index = static_cast<std::size_t>(resolved - kFirstGlyph);
  const std::size_t offset = index * font_height(font) + row;
  return face_of(font).rows[offset];
}

std::size_t text_width(const Font font, const std::size_t characters) {
  return characters == 0 ? 0 : characters * (font_width(font) + 1) - 1;
}

}
