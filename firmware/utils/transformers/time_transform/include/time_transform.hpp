#pragma once

#include <cstdint>
#include <span>

namespace pitrig::transformers::time_transform {

enum class Format : std::uint8_t {
  duration_ms,
  signed_duration_ms,
  clock_ms,
  compact_duration_ms,
  compact_clock_ms,
  signed_digits_ms,
  split_ms,
};

struct Config {
  Format format{Format::duration_ms};
};

[[nodiscard]] constexpr bool is_signed(const Format format) {
  return format == Format::signed_duration_ms || format == Format::signed_digits_ms;
}

[[nodiscard]] bool apply(const Config& config, std::uint32_t value, std::span<char> output);
[[nodiscard]] bool apply(const Config& config, std::int32_t value, std::span<char> output);

}
