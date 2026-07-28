#pragma once

#include <cstdint>
#include <type_traits>

namespace simcore::telemetry {

enum class Field : std::uint32_t {
  none = 0,
  speed = 1U << 0,
  rpm = 1U << 1,
  gear = 1U << 2,
  lap_time_current = 1U << 3,
  lap_time_best = 1U << 4,
  fuel = 1U << 5,
  lap_delta = 1U << 6,
  lap_time_estimated = 1U << 7,
  traction_control = 1U << 8,
  abs = 1U << 9,
  brake_bias = 1U << 10,
  fuel_average_consumption = 1U << 11,
  fuel_laps_remaining = 1U << 12,
};

[[nodiscard]] constexpr Field operator|(const Field left, const Field right) {
  using Value = std::underlying_type_t<Field>;
  return static_cast<Field>(static_cast<Value>(left) | static_cast<Value>(right));
}

constexpr Field& operator|=(Field& left, const Field right) {
  left = left | right;
  return left;
}

[[nodiscard]] constexpr Field operator&(const Field left, const Field right) {
  using Value = std::underlying_type_t<Field>;
  return static_cast<Field>(static_cast<Value>(left) & static_cast<Value>(right));
}

[[nodiscard]] constexpr bool contains(const Field fields, const Field field) {
  return (fields & field) != Field::none;
}

struct Values {
  float speed_kph{};
  std::uint32_t rpm{};
  std::int8_t gear{};
  std::uint32_t lap_time_current_ms{};
  std::uint32_t lap_time_best_ms{};
  float fuel_liters{};
  std::int32_t lap_delta_ms{};
  std::uint32_t lap_time_estimated_ms{};
  std::uint8_t traction_control_level{};
  std::uint8_t abs_level{};
  // Percentage in tenths: 540 represents 54.0%.
  std::uint16_t brake_bias_tenths_percent{};
  float fuel_average_liters_per_lap{};
  float fuel_laps_remaining{};
};

struct TelemetryUpdate {
  Values values{};
  Field present_fields{Field::none};
  Field invalid_fields{Field::none};
};

struct TelemetrySnapshot {
  Values values{};
  Field valid_fields{Field::none};
  std::uint64_t revision{};
  std::int64_t last_change_us{};
};

struct CommitResult {
  Field changed_fields{Field::none};
  std::uint64_t revision{};

  [[nodiscard]] bool changed() const {
    return changed_fields != Field::none;
  }
};

}  // namespace simcore::telemetry
