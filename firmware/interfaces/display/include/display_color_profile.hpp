#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace pitrig::display::driver {

inline constexpr std::size_t kColorResponseLevels = 256;

struct ColorProfile {
  std::array<float, 9> primaries{};
  std::array<std::array<std::uint16_t, kColorResponseLevels>, 3> response{};
};

}
