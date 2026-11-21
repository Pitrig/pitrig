#pragma once

#include <algorithm>
#include <cstdint>

namespace pitrig::value_smoothing {

inline constexpr std::int64_t kMinimumPeriodUs = 4'000;
inline constexpr std::int64_t kMaximumPeriodUs = 250'000;

[[nodiscard]] constexpr std::uint32_t blend_period(const std::uint32_t period_us,
                                                   const std::int64_t gap_us) {
  constexpr std::int64_t kShorterPeriodDivisor = 2;
  constexpr std::int64_t kLongerPeriodDivisor = 8;
  const std::int64_t gap = std::max(gap_us, kMinimumPeriodUs);
  if (period_us == 0) {
    return static_cast<std::uint32_t>(gap);
  }
  const auto period = static_cast<std::int64_t>(period_us);
  const std::int64_t divisor = gap < period ? kShorterPeriodDivisor : kLongerPeriodDivisor;
  return static_cast<std::uint32_t>(period + (gap - period) / divisor);
}

}
