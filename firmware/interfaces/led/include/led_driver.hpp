#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

namespace pitrig::led::driver {

enum class Chip : std::uint8_t { ws2812b, sk6812_rgbw };

[[nodiscard]] constexpr std::size_t bytes_per_lamp(const Chip chip) {
  return chip == Chip::sk6812_rgbw ? 4 : 3;
}

inline constexpr std::uint8_t kInvalidChannel = 0xFF;

struct Handle {
  std::uint8_t index{kInvalidChannel};

  [[nodiscard]] constexpr bool valid() const { return index != kInvalidChannel; }
};

struct Configuration {
  int pin{-1};
  Chip chip{Chip::ws2812b};
  std::size_t lamps{};
};

struct Driver {
  const char* name;
  Handle (*open)(const Configuration& configuration);
  bool (*transmit)(Handle handle, std::span<const std::uint8_t> bytes);
  bool (*wait)(Handle handle, std::uint32_t timeout_ms);
  void (*close)(Handle handle);
};

}
