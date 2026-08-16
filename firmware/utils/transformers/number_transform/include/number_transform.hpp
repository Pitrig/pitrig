#pragma once

#include <cstdint>
#include <span>
#include <string_view>

namespace simcore::transformers::number_transform {

// Decimal places the fixed-point conversion supports. Four keeps the scaled
// magnitude inside the range the conversion can round exactly.
inline constexpr std::uint8_t kMaximumDecimals = 4;

// Renders value * scale + offset with a fixed number of decimals. Unit
// conversion is expressed through scale and offset, so the device carries no
// table of unit names: km/h to mph is scale 0.621371, Celsius to Fahrenheit is
// scale 1.8 with offset 32.
struct Config {
  std::uint8_t decimals{0};
  float scale{1.0F};
  float offset{0.0F};
};

[[nodiscard]] bool apply(const Config& config, std::uint32_t value,
                         std::span<char> output);
[[nodiscard]] bool apply(const Config& config, std::int32_t value,
                         std::span<char> output);
[[nodiscard]] bool apply(const Config& config, float value,
                         std::span<char> output);
// Telemetry sources that carry a number as text stay usable: the source is
// parsed first and rejected when it does not hold a plain number.
[[nodiscard]] bool apply(const Config& config, std::string_view value,
                         std::span<char> output);

}  // namespace simcore::transformers::number_transform
