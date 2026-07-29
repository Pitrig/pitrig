#include "simhub_protocol.hpp"

#include <charconv>
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

}  // namespace

SimHubProtocol::SimHubProtocol(
    const telemetry::ITelemetryRegistry& registry)
    : bindings_{{
          {"R", registry.resolve(telemetry::fields::kRpm)},
          {"S", registry.resolve(telemetry::fields::kSpeed)},
          {"G", registry.resolve(telemetry::fields::kGear)},
          {"L", registry.resolve(telemetry::fields::kCurrentLapTime)},
          {"B", registry.resolve(telemetry::fields::kBestLapTime)},
          {"D", registry.resolve(telemetry::fields::kLapDelta)},
          {"P", registry.resolve(telemetry::fields::kEstimatedLapTime)},
          {"T", registry.resolve(telemetry::fields::kTractionControl)},
          {"A", registry.resolve(telemetry::fields::kAbs)},
          {"BB", registry.resolve(telemetry::fields::kBrakeBias)},
          {"F", registry.resolve(telemetry::fields::kFuelLevel)},
          {"FC", registry.resolve(
                     telemetry::fields::kFuelAverageConsumption)},
          {"FL", registry.resolve(telemetry::fields::kFuelLapsRemaining)},
      }} {
  initialized_ = true;
  for (const Binding& binding : bindings_) {
    if (!binding.handle.valid()) {
      initialized_ = false;
      break;
    }
  }
}

bool SimHubProtocol::initialized() const {
  return initialized_;
}

void SimHubProtocol::consume(const std::span<const std::uint8_t> data,
                             const telemetry::UpdateHandler handler,
                             void* const context) {
  if (!initialized_) {
    return;
  }
  for (const std::uint8_t byte : data) {
    if (byte == '\n') {
      if (!discard_until_newline_ && line_length_ > 0) {
        process_line(
            std::span<const char>{line_buffer_.data(), line_length_},
            handler, context);
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

telemetry::Handle SimHubProtocol::resolve_identifier(
    const std::span<const char> identifier) const {
  const std::string_view name{identifier.data(), identifier.size()};
  for (const Binding& binding : bindings_) {
    if (binding.identifier == name) {
      return binding.handle;
    }
  }
  return {};
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

  telemetry::TelemetryUpdate update{
      .handle = resolve_identifier(line.first(separator)),
  };
  if (!update.handle.valid()) {
    return;
  }

  const std::span<const char> value = line.subspan(separator + 1);
  if (value.empty()) {
    handler(update, context);
    return;
  }
  if (!telemetry::copy_text_value(update.value.source_text, value)) {
    return;
  }

  switch (update.handle.type) {
    case telemetry::ValueType::text:
      break;
    case telemetry::ValueType::uint32:
      if (!parse_integer(value, update.value.uint32_value)) {
        return;
      }
      break;
    case telemetry::ValueType::int32:
      if (!parse_integer(value, update.value.int32_value)) {
        return;
      }
      break;
  }

  update.available = true;
  handler(update, context);
}

}  // namespace simcore::protocols
