#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <mutex>

#include "telemetry_registry.hpp"
#include "telemetry_types.hpp"

namespace simcore::telemetry {

class ITelemetryReader {
 public:
  virtual ~ITelemetryReader() = default;
  [[nodiscard]] virtual TelemetryRead read(Handle handle) const = 0;
};

class TelemetryStateService final : public ITelemetryReader {
 public:
  explicit TelemetryStateService(const ITelemetryRegistry& registry);

  [[nodiscard]] CommitResult apply(const TelemetryUpdate& update);
  [[nodiscard]] TelemetryRead read(Handle handle) const override;

 private:
  struct Slot {
    std::atomic<std::uint32_t> sequence{0};
    Value value{};
    std::uint64_t revision{};
#if SIMCORE_DEBUG
    std::int64_t last_change_us{};
#endif
    bool available{};
  };

  const ITelemetryRegistry& registry_;
  std::mutex mutex_;
  std::array<Slot, catalog::kFieldCount> slots_{};
  std::uint64_t revision_{};
};

}
