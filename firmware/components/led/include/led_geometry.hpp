#pragma once

#include <cstddef>
#include <cstdint>

namespace pitrig::led {

inline constexpr std::size_t kOffPanel = static_cast<std::size_t>(-1);

enum class Order : std::uint8_t { progressive, serpentine };

enum class Origin : std::uint8_t { top_left, top_right, bottom_left, bottom_right };

struct Matrix {
  std::uint16_t width{};
  std::uint16_t height{};
  Order order{Order::serpentine};
  Origin origin{Origin::top_left};
  std::uint16_t rotation_deg{};

  [[nodiscard]] constexpr std::size_t lamps() const {
    return static_cast<std::size_t>(width) * height;
  }

  [[nodiscard]] std::uint16_t drawn_width() const;
  [[nodiscard]] std::uint16_t drawn_height() const;
};

[[nodiscard]] std::size_t matrix_lamp(const Matrix& matrix, int x, int y);

}
