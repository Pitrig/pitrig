#include "simhub_protocol.hpp"

#include <algorithm>
#include <charconv>
#include <limits>
#include <system_error>

namespace simcore::protocols {
namespace {

template <typename Value>
[[nodiscard]] bool parse_integer(const std::span<const char> text, Value& value) {
  if (text.empty()) {
    return false;
  }

  const auto result = std::from_chars(text.data(), text.data() + text.size(), value);
  return result.ec == std::errc{} && result.ptr == text.data() + text.size();
}

[[nodiscard]] bool parse_gear(const std::span<const char> text, std::int8_t& gear) {
  if (text.size() == 1) {
    if (text.front() == 'N' || text.front() == 'n') {
      gear = 0;
      return true;
    }
    if (text.front() == 'R' || text.front() == 'r') {
      gear = -1;
      return true;
    }
  }

  int parsed{};
  if (!parse_integer(text, parsed) || parsed < std::numeric_limits<std::int8_t>::min() ||
      parsed > std::numeric_limits<std::int8_t>::max()) {
    return false;
  }

  gear = static_cast<std::int8_t>(parsed);
  return true;
}

[[nodiscard]] bool parse_level(const std::span<const char> text, std::uint8_t& level) {
  unsigned int parsed{};
  if (!parse_integer(text, parsed) || parsed > std::numeric_limits<std::uint8_t>::max()) {
    return false;
  }
  level = static_cast<std::uint8_t>(parsed);
  return true;
}

[[nodiscard]] bool parse_pair(const std::span<const char> text, std::uint16_t& first,
                              std::uint16_t& second) {
  const auto separator = std::find(text.begin(), text.end(), ',');
  if (separator == text.end()) return false;
  unsigned int left{};
  unsigned int right{};
  if (!parse_integer(std::span<const char>{text.begin(), separator}, left) ||
      !parse_integer(std::span<const char>{separator + 1, text.end()}, right) ||
      left > std::numeric_limits<std::uint16_t>::max() ||
      right > std::numeric_limits<std::uint16_t>::max())
    return false;
  first = static_cast<std::uint16_t>(left);
  second = static_cast<std::uint16_t>(right);
  return true;
}

[[nodiscard]] bool parse_tire(const std::span<const char> text, telemetry::Values::Tire& tire) {
  const auto first_separator = std::find(text.begin(), text.end(), ',');
  if (first_separator == text.end()) return false;
  const auto second_separator = std::find(first_separator + 1, text.end(), ',');
  if (second_separator == text.end()) return false;
  unsigned int pressure_hundredths{};
  unsigned int surface_tenths{};
  unsigned int inner_tenths{};
  if (!parse_integer(std::span<const char>{text.begin(), first_separator}, pressure_hundredths) ||
      !parse_integer(std::span<const char>{first_separator + 1, second_separator},
                     surface_tenths) ||
      !parse_integer(std::span<const char>{second_separator + 1, text.end()}, inner_tenths) ||
      pressure_hundredths > 1000 || surface_tenths > 3000 || inner_tenths > 3000)
    return false;
  tire.pressure_bar = static_cast<float>(pressure_hundredths) / 100.0F;
  tire.surface_temperature_c = static_cast<float>(surface_tenths) / 10.0F;
  tire.inner_temperature_c = static_cast<float>(inner_tenths) / 10.0F;
  return true;
}

[[nodiscard]] bool parse_nonnegative_decimal(const std::span<const char> text, float& value) {
  if (text.empty()) {
    return false;
  }

  const auto decimal = std::find(text.begin(), text.end(), '.');
  const std::span<const char> whole{text.begin(), static_cast<std::size_t>(decimal - text.begin())};
  std::uint32_t whole_value{};
  if (!parse_integer(whole, whole_value) || whole_value > 1'000'000U) {
    return false;
  }

  std::uint32_t tenth{};
  if (decimal != text.end()) {
    const std::span<const char> fraction{decimal + 1,
                                         static_cast<std::size_t>(text.end() - decimal - 1)};
    if (fraction.size() != 1 || fraction.front() < '0' || fraction.front() > '9') {
      return false;
    }
    tenth = static_cast<std::uint32_t>(fraction.front() - '0');
  }

  value = static_cast<float>(whole_value) + static_cast<float>(tenth) * 0.1F;
  return true;
}

[[nodiscard]] bool parse_brake_bias(const std::span<const char> text,
    std::uint16_t& tenths_percent) {
  if (text.empty()) {
    return false;
  }

  const auto decimal = std::find(text.begin(), text.end(), '.');
  const std::span<const char> whole{text.begin(), static_cast<std::size_t>(decimal - text.begin())};
  unsigned int whole_percent{};
  if (!parse_integer(whole, whole_percent) || whole_percent > 100U) {
    return false;
  }

  unsigned int tenth{};
  if (decimal != text.end()) {
    const std::span<const char> fraction{decimal + 1,
                                         static_cast<std::size_t>(text.end() - decimal - 1)};
    if (fraction.size() != 1 || fraction.front() < '0' || fraction.front() > '9') {
      return false;
    }
    tenth = static_cast<unsigned int>(fraction.front() - '0');
  }

  const unsigned int parsed = whole_percent * 10U + tenth;
  if (parsed > 1'000U) {
    return false;
  }
  tenths_percent = static_cast<std::uint16_t>(parsed);
  return true;
}

}  // namespace

void SimHubProtocol::consume(const std::span<const std::uint8_t> data,
                             const telemetry::UpdateHandler handler, void* const context) {
  for (const std::uint8_t byte : data) {
    if (byte == '\n') {
      if (!discard_until_newline_ && line_length_ > 0) {
        process_line(std::span<const char>{line_buffer_.data(), line_length_}, handler, context);
      }

      line_length_ = 0;
      discard_until_newline_ = false;
      continue;
    }

    if (discard_until_newline_ || byte == '\r') {
      continue;
    }

    if (line_length_ == line_buffer_.size()) {
      line_length_ = 0;
      discard_until_newline_ = true;
      continue;
    }

    line_buffer_[line_length_++] = static_cast<char>(byte);
  }
}

void SimHubProtocol::process_line(const std::span<const char> line,
                                  const telemetry::UpdateHandler handler,
                                  void* const context) const {
  if (handler == nullptr || line.size() < 2) {
    return;
  }

  std::size_t separator{};
  if (line[1] == ';') {
    separator = 1;
  } else if (line.size() >= 3 && line[2] == ';') {
    separator = 2;
  } else {
    return;
  }

  const std::span<const char> identifier = line.first(separator);
  const std::span<const char> value = line.subspan(separator + 1);
  telemetry::TelemetryUpdate update{};

  if (identifier.size() == 2) {
    if (identifier[0] == 'L' && identifier[1] == 'L') {
      if (!parse_integer(value, update.values.lap_time_last_ms)) return;
      update.present_fields = telemetry::Field::lap_time_last;
      handler(update, context);
      return;
    }
    if (identifier[0] == 'S' && identifier[1] == 'T') {
      if (!parse_integer(value, update.values.session_time_seconds)) return;
      update.present_fields = telemetry::Field::session_time;
      handler(update, context);
      return;
    }
    if (identifier[0] == 'S' && identifier[1] == 'P') {
      if (!parse_pair(value, update.values.session_position,
                      update.values.session_participant_count))
        return;
      update.present_fields = telemetry::Field::session_position;
      handler(update, context);
      return;
    }
    if (identifier[0] == 'S' && identifier[1] == 'L') {
      if (!parse_pair(value, update.values.session_completed_laps,
                      update.values.session_total_laps))
        return;
      update.present_fields = telemetry::Field::session_laps;
      handler(update, context);
      return;
    }
    if (identifier[0] == 'A' && identifier[1] == 'T') {
      if (!parse_integer(value, update.values.air_temperature_tenths_c)) return;
      update.present_fields = telemetry::Field::air_temperature;
      handler(update, context);
      return;
    }
    if (identifier[0] == 'R' && identifier[1] == 'T') {
      if (!parse_integer(value, update.values.track_temperature_tenths_c)) return;
      update.present_fields = telemetry::Field::track_temperature;
      handler(update, context);
      return;
    }
    if (identifier[0] == 'C' && identifier[1] == 'T') {
      if (!parse_level(value, update.values.traction_control_cut_level)) return;
      update.present_fields = telemetry::Field::traction_control_cut;
      handler(update, context);
      return;
    }
    if (identifier[0] == 'E' && identifier[1] == 'M') {
      if (!parse_level(value, update.values.engine_map)) return;
      update.present_fields = telemetry::Field::engine_map;
      handler(update, context);
      return;
    }
    if (identifier[0] == 'X' && identifier[1] >= '1' && identifier[1] <= '4') {
      const unsigned int tire_index = static_cast<unsigned int>(identifier[1] - '1');
      std::array<telemetry::Values::Tire*, 4> tires{
          &update.values.tire_front_left, &update.values.tire_front_right,
          &update.values.tire_rear_left, &update.values.tire_rear_right};
      constexpr std::array<telemetry::Field, 4> fields{
          telemetry::Field::tire_front_left, telemetry::Field::tire_front_right,
          telemetry::Field::tire_rear_left, telemetry::Field::tire_rear_right};
      if (!parse_tire(value, *tires[tire_index])) return;
      update.present_fields = fields[tire_index];
      handler(update, context);
      return;
    }
    telemetry::Field field{};
    float* decimal_value{};
    if (identifier[0] == 'B' && identifier[1] == 'B') {
      if (value.empty()) {
        update.invalid_fields = telemetry::Field::brake_bias;
      } else if (!parse_brake_bias(value, update.values.brake_bias_tenths_percent)) {
        return;
      } else {
        update.present_fields = telemetry::Field::brake_bias;
      }
      handler(update, context);
      return;
    }

    if (identifier[0] == 'F' && identifier[1] == 'C') {
      field = telemetry::Field::fuel_average_consumption;
      decimal_value = &update.values.fuel_average_liters_per_lap;
    } else if (identifier[0] == 'F' && identifier[1] == 'L') {
      field = telemetry::Field::fuel_laps_remaining;
      decimal_value = &update.values.fuel_laps_remaining;
    } else {
      return;
    }

    if (value.empty()) {
      update.invalid_fields = field;
    } else if (!parse_nonnegative_decimal(value, *decimal_value)) {
      return;
    } else {
      update.present_fields = field;
    }
    handler(update, context);
    return;
  }

  switch (identifier.front()) {
    case 'R':
      if (!parse_integer(value, update.values.rpm)) {
        return;
      }
      update.present_fields = telemetry::Field::rpm;
      break;

    case 'S': {
      std::uint32_t speed{};
      if (!parse_integer(value, speed)) {
        return;
      }
      update.values.speed_kph = static_cast<float>(speed);
      update.present_fields = telemetry::Field::speed;
      break;
    }

    case 'G':
      if (!parse_gear(value, update.values.gear)) {
        return;
      }
      update.present_fields = telemetry::Field::gear;
      break;

    case 'L':
      if (!parse_integer(value, update.values.lap_time_current_ms)) {
        return;
      }
      update.present_fields = telemetry::Field::lap_time_current;
      break;

    case 'B':
      if (!parse_integer(value, update.values.lap_time_best_ms)) {
        return;
      }
      update.present_fields = telemetry::Field::lap_time_best;
      break;

    case 'D':
      if (value.empty()) {
        update.invalid_fields = telemetry::Field::lap_delta;
        break;
      }
      if (!parse_integer(value, update.values.lap_delta_ms)) {
        return;
      }
      update.present_fields = telemetry::Field::lap_delta;
      break;

    case 'P':
      if (value.empty()) {
        update.invalid_fields = telemetry::Field::lap_time_estimated;
        break;
      }
      if (!parse_integer(value, update.values.lap_time_estimated_ms)) {
        return;
      }
      update.present_fields = telemetry::Field::lap_time_estimated;
      break;

    case 'T':
      if (value.empty()) {
        update.invalid_fields = telemetry::Field::traction_control;
        break;
      }
      if (!parse_level(value, update.values.traction_control_level)) {
        return;
      }
      update.present_fields = telemetry::Field::traction_control;
      break;

    case 'A':
      if (value.empty()) {
        update.invalid_fields = telemetry::Field::abs;
        break;
      }
      if (!parse_level(value, update.values.abs_level)) {
        return;
      }
      update.present_fields = telemetry::Field::abs;
      break;

    case 'F':
      if (value.empty()) {
        update.invalid_fields = telemetry::Field::fuel;
        break;
      }
      if (!parse_nonnegative_decimal(value, update.values.fuel_liters)) {
        return;
      }
      update.present_fields = telemetry::Field::fuel;
      break;

    default:
      return;
  }

  handler(update, context);
}

}  // namespace simcore::protocols
