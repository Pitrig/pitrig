#include "display_color.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

#include "color_science.hpp"
#include "esp_heap_caps.h"
#include "pitrig_features.hpp"

namespace pitrig::display_color {
namespace {

constexpr std::array<std::uint8_t, 3> kRgb565Bits{5, 6, 5};
constexpr std::size_t kRgb565Values = 65'536;
constexpr std::size_t kTableBytes = kRgb565Values * sizeof(std::uint16_t) + kRgb565Values / 8;
constexpr float kResponseScale = 1.0F / 65'535.0F;
constexpr std::size_t kRememberedColors = 64;
constexpr std::size_t kTwinVariants = 8;
constexpr std::uint32_t kBlack = 0x000000U;
constexpr std::uint32_t kWhite = 0xFFFFFFU;

#if PITRIG_DISPLAY_COLOR_24BIT
constexpr std::array<std::uint8_t, 3> kPanelBits{8, 8, 8};
#else
constexpr std::array<std::uint8_t, 3> kPanelBits = kRgb565Bits;
#endif

[[nodiscard]] constexpr std::uint8_t expand(const std::uint8_t level, const std::uint8_t bits) {
  switch (bits) {
    case 5:
      return static_cast<std::uint8_t>((level << 3U) | (level >> 2U));
    case 6:
      return static_cast<std::uint8_t>((level << 2U) | (level >> 4U));
    default:
      return level;
  }
}

[[nodiscard]] constexpr std::uint8_t top_level(const std::uint8_t bits) {
  return static_cast<std::uint8_t>((1U << bits) - 1U);
}

[[nodiscard]] constexpr std::uint32_t twin(const std::uint32_t rgb, const std::size_t variant) {
  const auto bits = static_cast<std::uint32_t>(variant);
  return rgb ^ (((bits & 4U) << 14U) | ((bits & 2U) << 7U) | (bits & 1U));
}

}

Correction::Correction(const display::driver::ColorProfile& profile) : profile_(profile) {
  science::Matrix inverse{};
  if (!science::invert(profile.primaries, inverse)) {
    return;
  }
  const science::Vector d65 = science::transform(science::kSrgbToXyz, {1.0F, 1.0F, 1.0F});
  const science::Vector needed = science::transform(inverse, d65);
  const float largest = std::max({needed[0], needed[1], needed[2]});
  if (!std::isfinite(largest) || largest <= 0.0F) {
    return;
  }
  const float headroom = 1.0F / largest;
  srgb_to_panel_ = science::multiply(inverse, science::kSrgbToXyz);
  for (float& element : srgb_to_panel_) {
    element *= headroom;
  }
  white_ = {d65[0] * headroom, d65[1] * headroom, d65[2] * headroom};
  auto* const table = static_cast<std::uint8_t*>(
      heap_caps_calloc(1, kTableBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (table == nullptr) {
    return;
  }
  rgb565_table_ = reinterpret_cast<std::uint16_t*>(table);
  rgb565_known_ = table + kRgb565Values * sizeof(std::uint16_t);
  valid_ = true;
}

Correction::~Correction() {
  if (rgb565_table_ != nullptr) {
    heap_caps_free(rgb565_table_);
  }
}

std::uint16_t Correction::response(const std::size_t channel, const std::uint8_t level,
                                   const std::uint8_t bits) const {
  return profile_.response[channel][expand(level, bits)];
}

float Correction::light(const std::size_t channel, const std::uint8_t level,
                        const std::uint8_t bits) const {
  return static_cast<float>(response(channel, level, bits)) * kResponseScale;
}

Correction::Levels Correction::drive_levels(const std::array<float, 3>& linear,
                                            const Levels& bits) const {
  using Bracket = std::array<std::uint8_t, 2>;
  const science::Vector wanted = science::transform(srgb_to_panel_, linear);
  const science::Vector target =
      science::lab(science::transform(profile_.primaries, wanted), white_);
  std::array<Bracket, 3> brackets{};
  for (std::size_t channel = 0; channel < 3; ++channel) {
    const float light_wanted = std::clamp(wanted[channel], 0.0F, 1.0F);
    const std::uint8_t top = top_level(bits[channel]);
    std::uint8_t low = 0;
    std::uint8_t high = top;
    while (low < high) {
      const auto middle = static_cast<std::uint8_t>((low + high + 1U) / 2U);
      if (light(channel, middle, bits[channel]) <= light_wanted) {
        low = middle;
      } else {
        high = static_cast<std::uint8_t>(middle - 1U);
      }
    }
    const auto above = static_cast<std::uint8_t>(low < top ? low + 1U : top);
    while (low > 0 && response(channel, static_cast<std::uint8_t>(low - 1U), bits[channel]) ==
                          response(channel, low, bits[channel])) {
      --low;
    }
    brackets[channel] = {low, above};
  }
  float best_error = std::numeric_limits<float>::infinity();
  Levels best{};
  for (const std::uint8_t red : brackets[0]) {
    for (const std::uint8_t green : brackets[1]) {
      for (const std::uint8_t blue : brackets[2]) {
        const science::Vector light_mix{light(0, red, bits[0]), light(1, green, bits[1]),
                                        light(2, blue, bits[2])};
        const science::Vector xyz = science::transform(profile_.primaries, light_mix);
        const float error = science::delta_e_94(target, science::lab(xyz, white_));
        if (error < best_error) {
          best_error = error;
          best = {red, green, blue};
        }
      }
    }
  }
  return best;
}

std::uint32_t Correction::correct(const std::uint32_t rgb) const {
  const Levels levels =
      drive_levels({science::srgb_to_linear(static_cast<std::uint8_t>(rgb >> 16U)),
                    science::srgb_to_linear(static_cast<std::uint8_t>(rgb >> 8U)),
                    science::srgb_to_linear(static_cast<std::uint8_t>(rgb))},
                   kPanelBits);
  return (static_cast<std::uint32_t>(expand(levels[0], kPanelBits[0])) << 16U) |
         (static_cast<std::uint32_t>(expand(levels[1], kPanelBits[1])) << 8U) |
         expand(levels[2], kPanelBits[2]);
}

void Correction::apply(configuration::ApplicationConfiguration& configuration) const {
  struct Remembered {
    std::uint32_t authored;
    std::uint32_t corrected;
  };
  std::array<Remembered, kRememberedColors> remembered{};
  std::size_t count = 0;
  const auto taken = [&](const std::uint32_t corrected) {
    for (std::size_t index = 0; index < count; ++index) {
      if (remembered[index].corrected == corrected) {
        return true;
      }
    }
    return false;
  };
  const auto assign = [&](const std::uint32_t authored) {
    const std::uint32_t nearest = correct(authored);
    std::uint32_t corrected = nearest;
    for (std::size_t variant = 0; variant < kTwinVariants; ++variant) {
      if (!taken(twin(nearest, variant))) {
        corrected = twin(nearest, variant);
        break;
      }
    }
    if (count < remembered.size()) {
      remembered[count++] = {.authored = authored, .corrected = corrected};
    }
    return corrected;
  };
  assign(kBlack);
  assign(kWhite);
  auto visit = [&](std::uint32_t& color) {
    if (color == configuration::kTransparentColor) {
      return;
    }
    for (std::size_t index = 0; index < count; ++index) {
      if (remembered[index].authored == color) {
        color = remembered[index].corrected;
        return;
      }
    }
    color = assign(color);
  };
  configuration::for_each_dashboard_color(configuration, visit);
}

std::uint16_t Correction::corrected_rgb565(const std::uint16_t value) const {
  const Levels levels = drive_levels(
      {science::srgb_to_linear(expand(static_cast<std::uint8_t>(value >> 11U), 5)),
       science::srgb_to_linear(expand(static_cast<std::uint8_t>((value >> 5U) & 0x3FU), 6)),
       science::srgb_to_linear(expand(static_cast<std::uint8_t>(value & 0x1FU), 5))},
      kRgb565Bits);
  return static_cast<std::uint16_t>((levels[0] << 11U) | (levels[1] << 5U) | levels[2]);
}

void Correction::correct_rgb565(const std::span<std::uint8_t> pixels) {
  if (!valid_) {
    return;
  }
  for (std::size_t offset = 0; offset + 1 < pixels.size(); offset += 2) {
    const auto value = static_cast<std::uint16_t>(pixels[offset] | (pixels[offset + 1] << 8U));
    std::uint8_t& known = rgb565_known_[value >> 3U];
    const auto bit = static_cast<std::uint8_t>(1U << (value & 7U));
    if ((known & bit) == 0) {
      rgb565_table_[value] = corrected_rgb565(value);
      known = static_cast<std::uint8_t>(known | bit);
    }
    const std::uint16_t corrected = rgb565_table_[value];
    pixels[offset] = static_cast<std::uint8_t>(corrected & 0xFFU);
    pixels[offset + 1] = static_cast<std::uint8_t>(corrected >> 8U);
  }
}

}
