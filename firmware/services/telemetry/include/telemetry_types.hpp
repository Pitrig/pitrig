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
  lap_time_last = 1U << 13,
  session_time = 1U << 14,
  session_position = 1U << 15,
  session_laps = 1U << 16,
  air_temperature = 1U << 17,
  track_temperature = 1U << 18,
  traction_control_cut = 1U << 19,
  engine_map = 1U << 20,
  tire_front_left = 1U << 21,
  tire_front_right = 1U << 22,
  tire_rear_left = 1U << 23,
  tire_rear_right = 1U << 24,
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
  struct Tire {
    float pressure_bar{};
    float surface_temperature_c{};
    float inner_temperature_c{};

    [[nodiscard]] constexpr bool operator==(const Tire&) const = default;
  };

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
  std::uint32_t lap_time_last_ms{};
  std::uint32_t session_time_seconds{};
  std::uint16_t session_position{};
  std::uint16_t session_participant_count{};
  std::uint16_t session_completed_laps{};
  std::uint16_t session_total_laps{};
  std::int16_t air_temperature_tenths_c{};
  std::int16_t track_temperature_tenths_c{};
  std::uint8_t traction_control_cut_level{};
  std::uint8_t engine_map{};
  Tire tire_front_left{};
  Tire tire_front_right{};
  Tire tire_rear_left{};
  Tire tire_rear_right{};
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

  [[nodiscard]] bool changed() const { return changed_fields != Field::none; }
};

}  // namespace simcore::telemetry
