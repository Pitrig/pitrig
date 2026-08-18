#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <iterator>

#include "application_configuration.hpp"
#include "telemetry_types.hpp"

// Turning one telemetry value into the text a widget draws: the source's own
// representation, the transform over it, its affixes, and the zero it shows
// while it has nothing to read.
//
// None of this touches LVGL or knows what a widget is, which is why it lives
// beside the widgets rather than inside one of them. It sits above the
// contract and telemetry, so it cannot go in utils/ — the transformers there
// are what the contract is built on, not the other way round.
namespace simcore::dashboard::value_text {

using Buffer = std::array<char, telemetry::kTelemetryTextCapacity>;

// The whole of one value: the source's own representation, transformed, and
// wrapped in the transform's affixes. False when unavailable.
[[nodiscard]] bool transform_value(
    const configuration::ValueTransform& transform,
    const telemetry::TelemetryRead& value, Buffer& output);

// The zero one source shows while it has no value: rendered through its own
// transform, so a plain value reads 0 and a time value keeps its format with
// every field zeroed.
void placeholder_value(const configuration::ValueTransform& transform,
                       Buffer& output);

// Copies a fixed buffer into a possibly smaller one, always terminated.
template <std::size_t DestinationSize, std::size_t SourceSize>
void copy_text(std::array<char, DestinationSize>& destination,
               const std::array<char, SourceSize>& source) {
  destination.fill('\0');
  const auto terminator = std::find(source.begin(), source.end(), '\0');
  const std::size_t source_length =
      static_cast<std::size_t>(std::distance(source.begin(), terminator));
  const std::size_t length = std::min(DestinationSize - 1, source_length);
  std::copy_n(source.begin(), length, destination.begin());
}

}  // namespace simcore::dashboard::value_text
