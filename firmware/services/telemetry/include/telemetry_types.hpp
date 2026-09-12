#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "pitrig_features.hpp"

namespace pitrig::telemetry {

inline constexpr std::size_t kMaximumFields = 256;
inline constexpr std::size_t kTelemetryTextCapacity = 64;
inline constexpr std::size_t kMaximumTelemetryLineLength = 127;
using TextValue = std::array<char, kTelemetryTextCapacity>;

enum class ValueType : std::uint8_t {
  text,
  uint32,
  int32,
  float32,
  boolean,
};

struct Handle {
  static constexpr std::uint16_t kInvalidIndex = UINT16_MAX;

  std::uint16_t index{kInvalidIndex};
  ValueType type{ValueType::text};

  [[nodiscard]] constexpr bool valid() const { return index != kInvalidIndex; }
};

[[nodiscard]] constexpr bool operator==(const Handle left, const Handle right) {
  return left.index == right.index && left.type == right.type;
}

union TypedValue {
  std::uint32_t uint32_value{};
  std::int32_t int32_value;
  float float32_value;
  bool boolean_value;
};

struct Value {
  TextValue source_text{};
  TypedValue typed{};
};

[[nodiscard]] inline bool copy_text_value(TextValue& destination,
                                          const std::span<const char> text) {
  if (text.size() >= destination.size()) {
    return false;
  }
  destination.fill('\0');
  for (std::size_t index = 0; index < text.size(); ++index) {
    destination[index] = text[index];
  }
  return true;
}

struct TelemetryUpdate {
  Handle handle{};
  Value value{};
  bool available{};
};

struct TelemetryRead {
  Handle handle{};
  Value value{};
  std::uint64_t revision{};
#if PITRIG_DEBUG
  std::int64_t last_change_us{};
#endif
  bool available{};
};

struct CommitResult {
  Handle handle{};
  std::uint64_t revision{};
  bool state_changed{};

  [[nodiscard]] bool changed() const { return state_changed; }
};

}
