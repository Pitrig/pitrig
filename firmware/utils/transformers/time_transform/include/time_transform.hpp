#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

namespace simcore::transformers::time_transform {

inline constexpr std::size_t kAffixCapacity = 16;

enum class Format : std::uint8_t {
  duration_ms,
  signed_duration_ms,
};

struct Config {
  Format format{Format::duration_ms};
  std::array<char, kAffixCapacity> prefix{};
  std::array<char, kAffixCapacity> suffix{};
};

// Writes a null-terminated MM:SS.mmm value into caller-owned storage.
[[nodiscard]] bool duration_ms(std::uint32_t milliseconds,
                               std::span<char> output);

// Writes a null-terminated +S.mmm or -S.mmm value into caller-owned storage.
[[nodiscard]] bool signed_duration_ms(std::int32_t milliseconds,
                                      std::span<char> output);

// Applies the configured time transform and bounded affixes.
[[nodiscard]] bool apply(const Config& config, std::uint32_t value,
                         std::span<char> output);
[[nodiscard]] bool apply(const Config& config, std::int32_t value,
                         std::span<char> output);

}  // namespace simcore::transformers::time_transform
