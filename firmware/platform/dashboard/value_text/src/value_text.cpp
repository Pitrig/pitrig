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

// The source's own text, before any transform: its string if it carries one,
// "true"/"false" for a boolean, digits otherwise. False when unavailable.
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
      result = std::to_chars(output.data(), output.data() + output.size() - 1,
                             value.value.typed.float32_value);
      break;
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

// The value a transform produces, before its affixes.
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
          // Sources that format their number on the PC stay usable; a source
          // that is not a number renders the placeholder instead.
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

// Wraps a rendered body in its affixes. They belong to the transform rather
// than to one of its types, so an untransformed value can carry a unit too.
[[nodiscard]] bool compose(
    const configuration::ValueTransform& transform, const std::string_view body,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  transformers::TextWriter writer(output);
  if (writer.append(transformers::text_view(transform.prefix)) &&
      writer.append(body) &&
      writer.append(transformers::text_view(transform.suffix))) {
    return true;
  }
  // The value outranks its decoration: a source string long enough to crowd
  // out the affixes keeps its own text rather than losing everything.
  transformers::TextWriter value_only(output);
  return value_only.append(body);
}

// The zero a widget renders while its value is unavailable, run through the
// widget's own transform.
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

}  // namespace

// The zero one source shows while it has no value: rendered through its own
// transform, so a plain value reads 0 and a time value keeps its format with
// every field zeroed.
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

}  // namespace simcore::dashboard::value_text
