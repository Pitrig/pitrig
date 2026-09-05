#pragma once

#include <cstdint>
#include <span>
#include <string_view>

namespace pitrig::transformers::number_transform {

inline constexpr std::uint8_t kMaximumDecimals = 4;

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
[[nodiscard]] bool apply(const Config& config, std::string_view value,
                         std::span<char> output);

[[nodiscard]] bool parse(std::string_view text, float& value);

}
