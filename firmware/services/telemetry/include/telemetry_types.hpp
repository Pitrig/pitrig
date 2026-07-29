#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

namespace simcore::telemetry {

inline constexpr std::size_t kMaximumFields = 16;
inline constexpr std::size_t kTelemetryTextCapacity = 48;
using TextValue = std::array<char, kTelemetryTextCapacity>;

enum class ValueType : std::uint8_t {
  text,
  uint32,
  int32,
};

struct Handle {
  static constexpr std::uint16_t kInvalidIndex = UINT16_MAX;

  std::uint16_t index{kInvalidIndex};
  ValueType type{ValueType::text};

  [[nodiscard]] constexpr bool valid() const {
    return index != kInvalidIndex;
  }
};

[[nodiscard]] constexpr bool operator==(const Handle left,
                                        const Handle right) {
  return left.index == right.index && left.type == right.type;
}

struct Value {
  TextValue source_text{};
  std::uint32_t uint32_value{};
  std::int32_t int32_value{};
};

[[nodiscard]] inline bool copy_text_value(
    TextValue& destination, const std::span<const char> text) {
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
  std::int64_t last_change_us{};
  bool available{};
};

struct CommitResult {
  Handle handle{};
  std::uint64_t revision{};
  bool state_changed{};

  [[nodiscard]] bool changed() const {
    return state_changed;
  }
};

}  // namespace simcore::telemetry
