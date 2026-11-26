#include "color_science.hpp"

#include <cmath>
#include <cstddef>

namespace pitrig::display_color::science {
namespace {

constexpr float kLabEpsilon = 216.0F / 24389.0F;
constexpr float kLabSlope = 841.0F / 108.0F;
constexpr float kLabOffset = 4.0F / 29.0F;

[[nodiscard]] float lab_curve(const float ratio) {
  return ratio > kLabEpsilon ? std::cbrt(ratio) : ratio * kLabSlope + kLabOffset;
}

}

float srgb_to_linear(const std::uint8_t value) {
  const float encoded = static_cast<float>(value) / 255.0F;
  return encoded <= 0.04045F ? encoded / 12.92F : std::pow((encoded + 0.055F) / 1.055F, 2.4F);
}

Vector transform(const Matrix& matrix, const Vector& vector) {
  return {matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
          matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
          matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2]};
}

Matrix multiply(const Matrix& left, const Matrix& right) {
  Matrix product{};
  for (std::size_t row = 0; row < 3; ++row) {
    for (std::size_t column = 0; column < 3; ++column) {
      product[row * 3 + column] = left[row * 3] * right[column] +
                                  left[row * 3 + 1] * right[3 + column] +
                                  left[row * 3 + 2] * right[6 + column];
    }
  }
  return product;
}

bool invert(const Matrix& m, Matrix& inverse) {
  const float c0 = m[4] * m[8] - m[5] * m[7];
  const float c1 = m[5] * m[6] - m[3] * m[8];
  const float c2 = m[3] * m[7] - m[4] * m[6];
  const float determinant = m[0] * c0 + m[1] * c1 + m[2] * c2;
  if (!std::isfinite(determinant) || std::fabs(determinant) < 1e-9F) {
    return false;
  }
  const float scale = 1.0F / determinant;
  inverse = {c0 * scale,
             (m[2] * m[7] - m[1] * m[8]) * scale,
             (m[1] * m[5] - m[2] * m[4]) * scale,
             c1 * scale,
             (m[0] * m[8] - m[2] * m[6]) * scale,
             (m[2] * m[3] - m[0] * m[5]) * scale,
             c2 * scale,
             (m[1] * m[6] - m[0] * m[7]) * scale,
             (m[0] * m[4] - m[1] * m[3]) * scale};
  return true;
}

Vector lab(const Vector& xyz, const Vector& white) {
  const float fx = lab_curve(std::fmax(xyz[0], 0.0F) / white[0]);
  const float fy = lab_curve(std::fmax(xyz[1], 0.0F) / white[1]);
  const float fz = lab_curve(std::fmax(xyz[2], 0.0F) / white[2]);
  return {116.0F * fy - 16.0F, 500.0F * (fx - fy), 200.0F * (fy - fz)};
}

float delta_e_94(const Vector& reference, const Vector& sample) {
  const float lightness = sample[0] - reference[0];
  const float reference_chroma = std::hypot(reference[1], reference[2]);
  const float chroma = std::hypot(sample[1], sample[2]) - reference_chroma;
  const float a = sample[1] - reference[1];
  const float b = sample[2] - reference[2];
  const float hue_squared = std::fmax(a * a + b * b - chroma * chroma, 0.0F);
  const float chroma_scale = 1.0F + 0.045F * reference_chroma;
  const float hue_scale = 1.0F + 0.015F * reference_chroma;
  const float chroma_term = chroma / chroma_scale;
  return std::sqrt(lightness * lightness + chroma_term * chroma_term +
                   hue_squared / (hue_scale * hue_scale));
}

}
