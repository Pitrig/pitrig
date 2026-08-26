#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <iterator>

#include "application_configuration.hpp"
#include "telemetry_types.hpp"

namespace simcore::dashboard::value_text {

using Buffer = std::array<char, telemetry::kTelemetryTextCapacity>;

[[nodiscard]] bool transform_value(
    const configuration::ValueTransform& transform,
    const telemetry::TelemetryRead& value, Buffer& output);

void placeholder_value(const configuration::ValueTransform& transform,
                       Buffer& output);

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

}
