#include "led_matrix_paint.hpp"

#include <algorithm>
#include <array>
#include <cmath>

#include "led_font.hpp"
#include "number_transform.hpp"
#include "text_writer.hpp"

namespace simcore::rgb_leds {
namespace {

constexpr std::size_t kOffPanel = static_cast<std::size_t>(-1);

[[nodiscard]] led::Font font_of(const configuration::LedFont font) {
  switch (font) {
    case configuration::LedFont::bold_4x6:
      return led::Font::bold_4x6;
    case configuration::LedFont::regular_5x8:
      return led::Font::regular_5x8;
    case configuration::LedFont::bold_5x8:
      return led::Font::bold_5x8;
    default:
      return led::Font::regular_4x6;
  }
}

}

void Panel::set(const int x, const int y, const led::Color color) const {
  if (output == nullptr || matrix == nullptr) {
    return;
  }
  if (x < 0 || y < 0 || x >= area.width || y >= area.height) {
    return;
  }
  if (!area.holds(static_cast<std::uint16_t>(x), static_cast<std::uint16_t>(y))) {
    return;
  }
  const std::size_t lamp = led::matrix_lamp(*matrix, area.x + x, area.y + y);
  if (lamp == kOffPanel) {
    return;
  }
  output->set(lamp, color);
}

Panel panel_of(led::Output& output, const led::Matrix& matrix,
               const Area& area) {
  return Panel{.output = &output, .matrix = &matrix, .area = area};
}

void paint_sprite(const Panel& panel,
                  const configuration::LedSpriteConfiguration* const sprite,
                  const configuration::LedEffect& effect,
                  const std::optional<double> value,
                  const std::uint64_t elapsed_us) {
  if (sprite == nullptr || sprite->width == 0 || sprite->height == 0) {
    return;
  }
  const std::size_t area =
      static_cast<std::size_t>(sprite->width) * sprite->height;
  const std::string_view pixels = configuration::text_view(sprite->pixels);
  std::size_t frame = effect.sprite_frame;
  if (value.has_value()) {
    const double rounded = std::round(*value);
    frame = rounded <= 0 ? 0
                         : static_cast<std::size_t>(
                               std::min<double>(rounded, sprite->frame_count - 1));
  } else if (effect.sprite_loop && sprite->frame_count > 1) {
    const std::uint64_t step =
        static_cast<std::uint64_t>(effect.speed_ms == 0 ? 1000 : effect.speed_ms) *
        1000;
    frame = static_cast<std::size_t>((elapsed_us / step) % sprite->frame_count);
  }
  frame = std::min<std::size_t>(frame, sprite->frame_count - 1);
  const std::size_t base = frame * area;
  if (base + area > pixels.size()) {
    return;
  }
  std::array<led::Color, configuration::kLedPaletteSize> palette{};
  for (std::uint8_t index = 0; index < sprite->palette_count; ++index) {
    palette[index] = led::Color::from_rgb(sprite->palette[index].color);
  }
  const int origin_x = (panel.area.width - sprite->width) / 2;
  const int origin_y = (panel.area.height - sprite->height) / 2;
  for (std::uint8_t y = 0; y < sprite->height; ++y) {
    for (std::uint8_t x = 0; x < sprite->width; ++x) {
      const int index =
          configuration::led_palette_digit(pixels[base + y * sprite->width + x]);
      if (index < 0 || index >= sprite->palette_count) {
        continue;
      }
      panel.set(origin_x + x, origin_y + y, palette[index]);
    }
  }
}

void paint_text(const Panel& panel, const configuration::LedEffect& effect,
                const std::string_view text, const std::uint64_t elapsed_us) {
  if (text.empty()) {
    return;
  }
  const led::Font font = font_of(effect.font);
  const int advance = led::font_width(font) + 1;
  const auto width = static_cast<int>(led::text_width(font, text.size()));
  const int panel_width = panel.area.width;
  const int panel_height = panel.area.height;
  const int top = (panel_height - led::font_height(font)) / 2;
  const led::Color color = led::Color::from_rgb(effect.color);

  int left = (panel_width - width) / 2;
  if (width > panel_width) {
    const std::uint32_t step = effect.speed_ms == 0 ? 1'000 : effect.speed_ms;
    const auto span = static_cast<std::uint64_t>(width + panel_width);
    const auto travelled = static_cast<int>(
        (elapsed_us / (static_cast<std::uint64_t>(step) * 1'000)) % span);
    left = panel_width - travelled;
  }

  for (std::size_t index = 0; index < text.size(); ++index) {
    const int glyph_left = left + static_cast<int>(index) * advance;
    if (glyph_left >= panel_width ||
        glyph_left + led::font_width(font) <= 0) {
      continue;
    }
    for (std::uint8_t row = 0; row < led::font_height(font); ++row) {
      const std::uint16_t bits = led::glyph_row(font, text[index], row);
      for (std::uint8_t column = 0; column < led::font_width(font); ++column) {
        if ((bits & (1U << (led::font_width(font) - 1 - column))) != 0) {
          panel.set(glyph_left + column, top + row, color);
        }
      }
    }
  }
}

std::string_view effect_text(
    const configuration::LedEffect& effect,
    const telemetry::TelemetryRead& read, const std::span<char> scratch) {
  const std::string_view prefix = configuration::text_view(effect.text);
  if (!read.handle.valid() || !read.available) {
    return prefix;
  }
  std::array<char, 24> rendered{};
  std::string_view tail;
  if (read.handle.type == telemetry::ValueType::text) {
    tail = configuration::text_view(read.value.source_text);
  } else {
    const transformers::number_transform::Config plain{};
    const bool ok =
        read.handle.type == telemetry::ValueType::int32
            ? transformers::number_transform::apply(plain,
                                                    read.value.typed.int32_value,
                                                    rendered)
        : read.handle.type == telemetry::ValueType::float32
            ? transformers::number_transform::apply(
                  plain, read.value.typed.float32_value, rendered)
        : read.handle.type == telemetry::ValueType::boolean
            ? transformers::number_transform::apply(
                  plain,
                  static_cast<std::int32_t>(read.value.typed.boolean_value),
                  rendered)
            : transformers::number_transform::apply(
                  plain, read.value.typed.uint32_value, rendered);
    if (!ok) {
      return prefix;
    }
    tail = configuration::text_view(rendered);
  }
  transformers::TextWriter writer{scratch};
  if (!writer.append(prefix) || !writer.append(tail)) {
    return prefix;
  }
  return std::string_view{scratch.data()};
}

}
