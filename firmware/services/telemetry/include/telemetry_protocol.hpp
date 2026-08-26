#pragma once

#include <cstdint>
#include <span>

#include "telemetry_types.hpp"

namespace simcore::telemetry {

using UpdateHandler = void (*)(const TelemetryUpdate& update, void* context);

class IProtocol {
 public:
  virtual ~IProtocol() = default;

  virtual void consume_line(std::span<const std::uint8_t> line,
                            UpdateHandler handler,
                            void* context) = 0;
};

}
