#pragma once

#include <mutex>

#include "telemetry_types.hpp"

namespace simcore::telemetry {

class ITelemetryReader {
 public:
  virtual ~ITelemetryReader() = default;
  [[nodiscard]] virtual TelemetrySnapshot snapshot() const = 0;
};

// Owns the canonical mutable telemetry state and exposes coherent snapshots.
class TelemetryStateService final : public ITelemetryReader {
 public:
  [[nodiscard]] CommitResult apply(const TelemetryUpdate& update);
  [[nodiscard]] TelemetrySnapshot snapshot() const override;

 private:
  mutable std::mutex mutex_;
  TelemetrySnapshot state_{};
};

}  // namespace simcore::telemetry
