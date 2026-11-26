#pragma once

#include <array>
#include <cstdint>

namespace pitrig::display_color::science {

using Vector = std::array<float, 3>;
using Matrix = std::array<float, 9>;

inline constexpr Matrix kSrgbToXyz{0.4124564F, 0.3575761F, 0.1804375F,
                                   0.2126729F, 0.7151522F, 0.0721750F,
                                   0.0193339F, 0.1191920F, 0.9503041F};

[[nodiscard]] float srgb_to_linear(std::uint8_t value);

[[nodiscard]] Vector transform(const Matrix& matrix, const Vector& vector);

[[nodiscard]] Matrix multiply(const Matrix& left, const Matrix& right);

[[nodiscard]] bool invert(const Matrix& matrix, Matrix& inverse);

[[nodiscard]] Vector lab(const Vector& xyz, const Vector& white);

[[nodiscard]] float delta_e_94(const Vector& reference, const Vector& sample);

}
