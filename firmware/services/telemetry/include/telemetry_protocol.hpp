#pragma once

#include <cstdint>
#include <span>

#include "telemetry_types.hpp"

namespace simcore::telemetry {

using UpdateHandler = void (*)(const TelemetryUpdate& update, void* context);

class IProtocol {
 public:
  virtual ~IProtocol() = default;

  // Decodes one complete line — no terminator, at most
  // kMaximumTelemetryLineLength bytes — and emits zero or more updates. Line
  // assembly belongs to whoever owns the byte stream, so a protocol holds no
  // partial line between calls.
  virtual void consume_line(std::span<const std::uint8_t> line,
                            UpdateHandler handler,
                            void* context) = 0;
};

}  // namespace simcore::telemetry
