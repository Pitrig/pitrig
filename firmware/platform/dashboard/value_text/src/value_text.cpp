#include "value_text.hpp"

#include <algorithm>
#include <cstdint>
#include <iterator>
#include <string_view>

#include "number_transform.hpp"
#include "text_writer.hpp"
#include "time_transform.hpp"

namespace simcore::dashboard::value_text {
namespace {

[[nodiscard]] bool plain_float_text(
    const float value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  constexpr transformers::number_transform::Config kThreeDecimals{
      .decimals = 3, .scale = 1.0F, .offset = 0.0F};
  if (!transformers::number_transform::apply(kThreeDecimals, value, output)) {
    return false;
  }
  const auto end = std::find(output.begin(), output.end(), '\0');
  auto last = end;
  while (last != output.begin() && *(last - 1) == '0') {
    --last;
  }
  if (last != output.begin() && *(last - 1) == '.') {
    --last;
  }
  std::fill(last, end, '\0');
  return true;
}

[[nodiscard]] bool source_text(
    const telemetry::TelemetryRead& value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  if (!value.available) {
    return false;
  }
  if (value.value.source_text.front() != '\0' ||
      value.handle.type == telemetry::ValueType::text) {
    output = value.value.source_text;
    return true;
  }
  if (value.handle.type == telemetry::ValueType::boolean) {
    constexpr std::array<char, 6> kTrue{'t', 'r', 'u', 'e', '\0', '\0'};
    constexpr std::array<char, 6> kFalse{'f', 'a', 'l', 's', 'e', '\0'};
    copy_text(output,
              value.value.typed.boolean_value ? kTrue : kFalse);
    return true;
  }
  std::to_chars_result result{};
  switch (value.handle.type) {
    case telemetry::ValueType::uint32:
      result = std::to_chars(output.data(), output.data() + output.size() - 1,
                             value.value.typed.uint32_value);
      break;
    case telemetry::ValueType::int32:
      result = std::to_chars(output.data(), output.data() + output.size() - 1,
                             value.value.typed.int32_value);
      break;
    case telemetry::ValueType::float32:
      return plain_float_text(value.value.typed.float32_value, output);
    case telemetry::ValueType::text:
    case telemetry::ValueType::boolean:
      return false;
  }
  if (result.ec != std::errc{}) {
    return false;
  }
  *result.ptr = '\0';
  return true;
}

[[nodiscard]] bool transform_body(
    const configuration::ValueTransform& transform,
    const telemetry::TelemetryRead& value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  switch (transform.type) {
    case configuration::ValueTransformType::none:
      return source_text(value, output);
    case configuration::ValueTransformType::time:
      if (value.handle.type == telemetry::ValueType::uint32) {
        return transformers::time_transform::apply(
            transform.time, value.value.typed.uint32_value, output);
      }
      if (value.handle.type == telemetry::ValueType::int32) {
        return transformers::time_transform::apply(
            transform.time, value.value.typed.int32_value, output);
      }
      return false;
    case configuration::ValueTransformType::number:
      switch (value.handle.type) {
        case telemetry::ValueType::uint32:
          return transformers::number_transform::apply(
              transform.number, value.value.typed.uint32_value, output);
        case telemetry::ValueType::int32:
          return transformers::number_transform::apply(
              transform.number, value.value.typed.int32_value, output);
        case telemetry::ValueType::float32:
          return transformers::number_transform::apply(
              transform.number, value.value.typed.float32_value, output);
        case telemetry::ValueType::text:
          return transformers::number_transform::apply(
              transform.number, transformers::text_view(value.value.source_text),
              output);
        case telemetry::ValueType::boolean:
          return false;
      }
      return false;
  }
  return false;
}

[[nodiscard]] bool compose(
    const configuration::ValueTransform& transform, const std::string_view body,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  transformers::TextWriter writer(output);
  if (writer.append(transformers::text_view(transform.prefix)) &&
      writer.append(body) &&
      writer.append(transformers::text_view(transform.suffix))) {
    return true;
  }
  transformers::TextWriter value_only(output);
  return value_only.append(body);
}

[[nodiscard]] bool zero_body(
    const configuration::ValueTransform& transform,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  switch (transform.type) {
    case configuration::ValueTransformType::none:
      return false;
    case configuration::ValueTransformType::time:
      return transform.time.format ==
                     transformers::time_transform::Format::signed_duration_ms
                 ? transformers::time_transform::apply(
                       transform.time, std::int32_t{0}, output)
                 : transformers::time_transform::apply(
                       transform.time, std::uint32_t{0}, output);
    case configuration::ValueTransformType::number:
      return transformers::number_transform::apply(
          transform.number, std::uint32_t{0}, output);
  }
  return false;
}

}

void placeholder_value(
    const configuration::ValueTransform& transform,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  std::array<char, telemetry::kTelemetryTextCapacity> body{};
  if (!zero_body(transform, body)) {
    constexpr std::array<char, 2> kZero{'0', '\0'};
    copy_text(body, kZero);
  }
  if (!compose(transform, transformers::text_view(body), output)) {
    output = body;
  }
}

[[nodiscard]] bool transform_value(
    const configuration::ValueTransform& transform,
    const telemetry::TelemetryRead& value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  if (!value.available) {
    return false;
  }
  std::array<char, telemetry::kTelemetryTextCapacity> body{};
  return transform_body(transform, value, body) &&
         compose(transform, transformers::text_view(body), output);
}

}
