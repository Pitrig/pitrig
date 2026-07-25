#pragma once

#include <cstdint>
#include <span>

#include "telemetry_types.hpp"

namespace simcore::telemetry {

using UpdateHandler = void (*)(const TelemetryUpdate& update, void* context);

class IProtocol {
 public:
  virtual ~IProtocol() = default;

  // Consumes a transport chunk and emits zero or more complete updates.
  virtual void consume(std::span<const std::uint8_t> data,
                       UpdateHandler handler,
                       void* context) = 0;
};

}  // namespace simcore::telemetry
