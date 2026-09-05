#include <algorithm>

#include "led_paint.hpp"

namespace pitrig::rgb_leds {

void Surface::put(const std::size_t offset, const led::Color color) const {
  if (area_.width == 0) {
    return;
  }
  const auto column = static_cast<std::uint16_t>(offset % area_.width);
  const auto row = static_cast<std::uint16_t>(offset / area_.width);
  if (!area_.holds(column, row)) {
    return;
  }
  const std::size_t lamp =
      led::matrix_lamp(*matrix_, area_.x + column, area_.y + row);
  if (lamp != static_cast<std::size_t>(-1)) {
    output_->set(lamp, color);
  }
}

void Surface::set(const std::size_t index, const led::Color color) const {
  if (index >= size()) {
    return;
  }
  if (!mirrored_) {
    put(inverted_ ? count_ - 1 - index : index, color);
    return;
  }
  const std::size_t half = size();
  put(inverted_ ? index : half - 1 - index, color);
  put(inverted_ ? count_ - 1 - index : count_ - half + index, color);
}

bool Area::holds(const std::uint16_t column, const std::uint16_t row) const {
  if (mask.empty()) {
    return true;
  }
  const std::size_t pixel =
      static_cast<std::size_t>(y + row) * stride + (x + column);
  const std::size_t digit = pixel / 4;
  if (digit >= mask.size()) {
    return false;
  }
  const int value = configuration::led_palette_digit(mask[digit]);
  return value >= 0 && (value & (1 << (3 - pixel % 4))) != 0;
}

Area area_of(const led::Matrix& matrix,
             const configuration::LedEffect& effect) {
  const std::uint16_t across = matrix.drawn_width();
  const std::uint16_t down = matrix.drawn_height();
  if (across == 0 || down == 0) {
    return {};
  }
  if (down == 1) {
    if (effect.from >= across) {
      return {};
    }
    const auto available = static_cast<std::uint16_t>(across - effect.from);
    const std::uint16_t count =
        effect.count == 0 ? available : std::min(effect.count, available);
    return count == 0 ? Area{} : Area{effect.from, 0, count, 1, {}, across};
  }
  const std::string_view mask = configuration::text_view(effect.panel_mask);
  if (mask.empty()) {
    return Area{0, 0, across, down, {}, across};
  }
  Area whole{0, 0, across, down, mask, across};
  std::uint16_t left = across;
  std::uint16_t top = down;
  std::uint16_t right = 0;
  std::uint16_t bottom = 0;
  for (std::uint16_t row = 0; row < down; ++row) {
    for (std::uint16_t column = 0; column < across; ++column) {
      if (!whole.holds(column, row)) {
        continue;
      }
      left = std::min(left, column);
      top = std::min(top, row);
      right = std::max(right, column);
      bottom = std::max(bottom, row);
    }
  }
  if (left > right || top > bottom) {
    return {};
  }
  return Area{left, top, static_cast<std::uint16_t>(right - left + 1),
              static_cast<std::uint16_t>(bottom - top + 1), mask, across};
}

Surface surface_of(led::Output& output, const led::Matrix& matrix,
                   const Area& area, const configuration::LedEffect& effect) {
  return Surface{output, matrix, area, effect.inverted, effect.mirrored};
}

void fill_area(led::Output& output, const led::Matrix& matrix, const Area& area,
               const led::Color color) {
  for (std::uint16_t row = 0; row < area.height; ++row) {
    for (std::uint16_t column = 0; column < area.width; ++column) {
      if (!area.holds(column, row)) {
        continue;
      }
      const std::size_t lamp =
          led::matrix_lamp(matrix, area.x + column, area.y + row);
      if (lamp != static_cast<std::size_t>(-1)) {
        output.set(lamp, color);
      }
    }
  }
}

}
