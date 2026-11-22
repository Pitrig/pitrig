#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <span>

#include "telemetry_registry.hpp"
#include "telemetry_types.hpp"

namespace pitrig::telemetry {

class ITelemetryReader {
 public:
  virtual ~ITelemetryReader() = default;
  [[nodiscard]] virtual TelemetryRead read(Handle handle) const = 0;
  [[nodiscard]] virtual bool started() const = 0;
  [[nodiscard]] virtual std::int64_t last_arrival_us() const = 0;
};

struct StateSlot {
  std::atomic<std::uint32_t> sequence{0};
  Value value{};
  std::uint64_t revision{};
#if PITRIG_DEBUG
  std::int64_t last_change_us{};
#endif
  bool available{};
};

class TelemetryStateService final : public ITelemetryReader {
 public:
  static constexpr std::size_t kStorageBytes =
      sizeof(StateSlot) * catalog::kFieldCount + alignof(StateSlot);

  explicit TelemetryStateService(const ITelemetryRegistry& registry);

  [[nodiscard]] bool attach(std::span<std::uint8_t> storage);
  [[nodiscard]] CommitResult apply(const TelemetryUpdate& update);
  [[nodiscard]] TelemetryRead read(Handle handle) const override;
  [[nodiscard]] bool started() const override;
  [[nodiscard]] std::int64_t last_arrival_us() const override;

 private:
  const ITelemetryRegistry& registry_;
  std::mutex mutex_;
  std::span<StateSlot> slots_{};
  std::uint64_t revision_{};
  std::atomic<std::int64_t> last_arrival_us_{0};
  std::atomic<bool> started_{false};
};

}
