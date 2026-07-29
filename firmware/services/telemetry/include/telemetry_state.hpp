#pragma once

#include <array>
#include <mutex>

#include "telemetry_registry.hpp"
#include "telemetry_types.hpp"

namespace simcore::telemetry {

class ITelemetryReader {
 public:
  virtual ~ITelemetryReader() = default;
  [[nodiscard]] virtual TelemetryRead read(Handle handle) const = 0;
};

// Owns canonical mutable values. Registry metadata is immutable and remains
// separate from the state slots.
class TelemetryStateService final : public ITelemetryReader {
 public:
  explicit TelemetryStateService(const ITelemetryRegistry& registry);

  [[nodiscard]] CommitResult apply(const TelemetryUpdate& update);
  [[nodiscard]] TelemetryRead read(Handle handle) const override;

 private:
  struct Slot {
    Value value{};
    std::uint64_t revision{};
    std::int64_t last_change_us{};
    bool available{};
  };

  const ITelemetryRegistry& registry_;
  mutable std::mutex mutex_;
  std::array<Slot, kMaximumFields> slots_{};
  std::uint64_t revision_{};
};

}  // namespace simcore::telemetry
