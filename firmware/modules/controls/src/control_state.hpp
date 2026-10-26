#pragma once

#include <array>
#include <cstdint>

#include "control_plan.hpp"

namespace pitrig::controls {

inline constexpr std::uint64_t kRepeatDelayUs = 400'000;
inline constexpr std::uint64_t kRepeatIntervalUs = 150'000;
inline constexpr std::uint64_t kStaleInputUs = 1'500'000;
inline constexpr std::uint64_t kSaveDelayUs = 2'000'000;
inline constexpr std::uint32_t kSessionRewindMs = 5'000;
inline constexpr std::uint8_t kLevelStep = 10;
inline constexpr std::uint8_t kLowestLevel = 10;
inline constexpr std::uint8_t kHighestLevel = 100;
inline constexpr char kTag[] = "controls";

struct State {
  std::uint32_t held{};
  std::array<std::uint64_t, kButtonCount> next_repeat_us{};
  std::uint32_t position{};
  std::uint64_t activity_us{};
  std::uint8_t seen_screen{kNone};
  bool home_sent{};
  std::uint8_t hold_screen{kNone};
  std::uint8_t hold_return{kNone};
  std::uint8_t rule_screen{kNone};
  std::uint8_t rule_return{kNone};
  std::uint32_t elapsed_ms{};
  bool has_elapsed{};
  std::uint8_t display_percent{kHighestLevel};
  std::uint64_t save_due_us{};
};

}
