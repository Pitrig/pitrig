#include "led_geometry.hpp"

namespace pitrig::led {
namespace {

void unrotate(const Matrix& matrix, int& x, int& y) {
  const int width = matrix.width;
  const int height = matrix.height;
  switch (matrix.rotation_deg) {
    case 90: {
      const int rotated_x = y;
      const int rotated_y = height - 1 - x;
      x = rotated_x;
      y = rotated_y;
      break;
    }
    case 180:
      x = width - 1 - x;
      y = height - 1 - y;
      break;
    case 270: {
      const int rotated_x = width - 1 - y;
      const int rotated_y = x;
      x = rotated_x;
      y = rotated_y;
      break;
    }
    default:
      break;
  }
}

void to_origin(const Matrix& matrix, int& x, int& y) {
  switch (matrix.origin) {
    case Origin::top_right:
      x = matrix.width - 1 - x;
      break;
    case Origin::bottom_left:
      y = matrix.height - 1 - y;
      break;
    case Origin::bottom_right:
      x = matrix.width - 1 - x;
      y = matrix.height - 1 - y;
      break;
    case Origin::top_left:
      break;
  }
}

}

std::uint16_t Matrix::drawn_width() const {
  return rotation_deg == 90 || rotation_deg == 270 ? height : width;
}

std::uint16_t Matrix::drawn_height() const {
  return rotation_deg == 90 || rotation_deg == 270 ? width : height;
}

std::size_t matrix_lamp(const Matrix& matrix, int x, int y) {
  if (matrix.width == 0 || matrix.height == 0 || x < 0 || y < 0 || x >= matrix.drawn_width() ||
      y >= matrix.drawn_height()) {
    return kOffPanel;
  }
  unrotate(matrix, x, y);
  to_origin(matrix, x, y);
  const bool reversed = matrix.order == Order::serpentine && (y % 2 == 1);
  const int column = reversed ? matrix.width - 1 - x : x;
  return static_cast<std::size_t>(y) * matrix.width + column;
}

}
