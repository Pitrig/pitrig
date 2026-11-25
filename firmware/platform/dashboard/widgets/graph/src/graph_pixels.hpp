#pragma once

#include <algorithm>
#include <cstdint>

#include "lvgl.h"

namespace pitrig::dashboard::graph_widget::pixels {

inline constexpr std::uint32_t kChannel = 255;

[[nodiscard]] inline std::uint8_t mix(const std::uint32_t under, const std::uint32_t over,
                                      const std::uint32_t amount) {
  return static_cast<std::uint8_t>((under * (kChannel - amount) + over * amount + kChannel / 2) /
                                   kChannel);
}

struct Rgb565 {
  static constexpr std::int32_t kBytes = 2;

  [[nodiscard]] static std::uint32_t pack(const std::uint32_t rgb) {
    return ((rgb >> 8U) & 0xF800U) | ((rgb >> 5U) & 0x07E0U) | ((rgb >> 3U) & 0x001FU);
  }

  static void put(std::uint8_t* const pixel, const std::uint32_t value) {
    *reinterpret_cast<std::uint16_t*>(pixel) = static_cast<std::uint16_t>(value);
  }

  static void put_row(std::uint8_t* const pixel, const std::uint32_t value, std::int32_t count) {
    auto* single = reinterpret_cast<std::uint16_t*>(pixel);
    if ((reinterpret_cast<std::uintptr_t>(single) & 2U) != 0U && count > 0) {
      *single++ = static_cast<std::uint16_t>(value);
      --count;
    }
    auto* pair = reinterpret_cast<std::uint32_t*>(single);
    const std::uint32_t doubled = (value & 0xFFFFU) | (value << 16U);
    for (; count >= 2; count -= 2) {
      *pair++ = doubled;
    }
    if (count > 0) {
      *reinterpret_cast<std::uint16_t*>(pair) = static_cast<std::uint16_t>(value);
    }
  }

  [[gnu::always_inline]] static void blend(std::uint8_t* const pixel, const std::uint32_t value,
                                           const std::uint8_t amount) {
    constexpr std::uint32_t kSpread = 0x07E0F81FU;
    auto* const target = reinterpret_cast<std::uint16_t*>(pixel);
    const std::uint32_t weight = (static_cast<std::uint32_t>(amount) + 4U) >> 3U;
    const std::uint32_t under = (*target | (static_cast<std::uint32_t>(*target) << 16U)) & kSpread;
    const std::uint32_t over = (value | (value << 16U)) & kSpread;
    const std::uint32_t mixed = ((((over - under) * weight) >> 5U) + under) & kSpread;
    *target = static_cast<std::uint16_t>(mixed | (mixed >> 16U));
  }
};

template <std::int32_t Bytes, bool Alpha = false>
struct Wide {
  static constexpr std::int32_t kBytes = Bytes;

  [[nodiscard]] static std::uint32_t pack(const std::uint32_t rgb) { return rgb; }

  static void put(std::uint8_t* const pixel, const std::uint32_t value) {
    pixel[0] = static_cast<std::uint8_t>(value & kChannel);
    pixel[1] = static_cast<std::uint8_t>((value >> 8U) & kChannel);
    pixel[2] = static_cast<std::uint8_t>((value >> 16U) & kChannel);
    if constexpr (Bytes == 4) {
      pixel[3] = static_cast<std::uint8_t>(kChannel);
    }
  }

  static void put_row(std::uint8_t* pixel, const std::uint32_t value, const std::int32_t count) {
    for (std::int32_t index = 0; index < count; ++index, pixel += Bytes) {
      put(pixel, value);
    }
  }

  static void blend(std::uint8_t* const pixel, const std::uint32_t value,
                    const std::uint8_t amount) {
    if constexpr (Alpha) {
      if (pixel[3] < kChannel) {
        composite(pixel, value, amount);
        return;
      }
    }
    pixel[0] = mix(pixel[0], value & kChannel, amount);
    pixel[1] = mix(pixel[1], (value >> 8U) & kChannel, amount);
    pixel[2] = mix(pixel[2], (value >> 16U) & kChannel, amount);
    if constexpr (Bytes == 4) {
      pixel[3] = static_cast<std::uint8_t>(std::max<std::uint32_t>(pixel[3], amount));
    }
  }

  static void composite(std::uint8_t* const pixel, const std::uint32_t value,
                        const std::uint32_t amount) {
    const std::uint32_t kept = pixel[3] * (kChannel - amount) / kChannel;
    const std::uint32_t total = amount + kept;
    if (total == 0U) {
      return;
    }
    for (std::uint32_t channel = 0; channel < 3U; ++channel) {
      const std::uint32_t over = (value >> (8U * channel)) & kChannel;
      pixel[channel] =
          static_cast<std::uint8_t>((over * amount + pixel[channel] * kept + total / 2U) / total);
    }
    pixel[3] = static_cast<std::uint8_t>(total);
  }
};

using Rgb888 = Wide<3>;
using Xrgb8888 = Wide<4>;
using Argb8888 = Wide<4, true>;

}
