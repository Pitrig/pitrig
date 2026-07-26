#include "simhub_protocol.hpp"

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
  if (handler == nullptr || line.size() < 2 || line[1] != ';') {
    return;
  }

  const std::span<const char> value = line.subspan(2);
  telemetry::TelemetryUpdate update{};

  switch (line.front()) {
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

    default:
      return;
  }

  handler(update, context);
}

}  // namespace simcore::protocols
