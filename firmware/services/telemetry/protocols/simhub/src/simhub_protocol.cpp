#include "simhub_protocol.hpp"

#include <algorithm>
#include <charconv>
#include <limits>
#include <system_error>

namespace simcore::protocols {
namespace {

template <typename Value>
[[nodiscard]] bool parse_integer(const std::span<const char> text,
                                 Value& value) {
  if (text.empty()) {
    return false;
  }

  const auto result =
      std::from_chars(text.data(), text.data() + text.size(), value);
  return result.ec == std::errc{} &&
         result.ptr == text.data() + text.size();
}

[[nodiscard]] bool parse_gear(const std::span<const char> text,
                              std::int8_t& gear) {
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
  if (!parse_integer(text, parsed) ||
      parsed < std::numeric_limits<std::int8_t>::min() ||
      parsed > std::numeric_limits<std::int8_t>::max()) {
    return false;
  }

  gear = static_cast<std::int8_t>(parsed);
  return true;
}

[[nodiscard]] bool parse_level(const std::span<const char> text,
                               std::uint8_t& level) {
  unsigned int parsed{};
  if (!parse_integer(text, parsed) ||
      parsed > std::numeric_limits<std::uint8_t>::max()) {
    return false;
  }
  level = static_cast<std::uint8_t>(parsed);
  return true;
}

[[nodiscard]] bool parse_brake_bias(
    const std::span<const char> text,
    std::uint16_t& tenths_percent) {
  if (text.empty()) {
    return false;
  }

  const auto decimal = std::find(text.begin(), text.end(), '.');
  const std::span<const char> whole{
      text.begin(), static_cast<std::size_t>(decimal - text.begin())};
  unsigned int whole_percent{};
  if (!parse_integer(whole, whole_percent) || whole_percent > 100U) {
    return false;
  }

  unsigned int tenth{};
  if (decimal != text.end()) {
    const std::span<const char> fraction{
        decimal + 1, static_cast<std::size_t>(text.end() - decimal - 1)};
    if (fraction.size() != 1 || fraction.front() < '0' ||
        fraction.front() > '9') {
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
                             const telemetry::UpdateHandler handler,
                             void* const context) {
  for (const std::uint8_t byte : data) {
    if (byte == '\n') {
      if (!discard_until_newline_ && line_length_ > 0) {
        process_line(
            std::span<const char>{line_buffer_.data(), line_length_},
            handler,
            context);
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
    if (identifier[0] != 'B' || identifier[1] != 'B') {
      return;
    }
    if (value.empty()) {
      update.invalid_fields = telemetry::Field::brake_bias;
    } else if (!parse_brake_bias(
                   value, update.values.brake_bias_tenths_percent)) {
      return;
    } else {
      update.present_fields = telemetry::Field::brake_bias;
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

    default:
      return;
  }

  handler(update, context);
}

}  // namespace simcore::protocols
