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
  // Lock-free and wait-free for the caller in the common case: a reader never
  // blocks on a writer, and a writer never waits for readers. Every widget of
  // the dashboard reads through this on every render pass, so this is the one
  // path that must not take a lock.
  [[nodiscard]] virtual TelemetryRead read(Handle handle) const = 0;
};

// Owns canonical mutable values. Registry metadata is immutable and remains
// separate from the state slots.
//
// Reads outnumber writes by orders of magnitude — a hundred widgets polling at
// the refresh rate against a few hundred changed values a second — so each
// slot is a seqlock: a writer bumps the slot's sequence to odd, updates the
// fields, and bumps it back to even; a reader copies the fields without a lock
// and retries the copy if the sequence moved under it. Writers serialise among
// themselves through the mutex, which readers never touch.
class TelemetryStateService final : public ITelemetryReader {
 public:
  explicit TelemetryStateService(const ITelemetryRegistry& registry);

  [[nodiscard]] CommitResult apply(const TelemetryUpdate& update);
  [[nodiscard]] TelemetryRead read(Handle handle) const override;

 private:
  struct Slot {
    // Odd while a writer is between its two stores; the fields below are
    // consistent only when a reader saw the same even value before and after
    // copying them.
    std::atomic<std::uint32_t> sequence{0};
    Value value{};
    std::uint64_t revision{};
    std::int64_t last_change_us{};
    bool available{};
  };

  const ITelemetryRegistry& registry_;
  // Writers only.
  std::mutex mutex_;
  std::array<Slot, catalog::kFieldCount> slots_{};
  std::uint64_t revision_{};
};

}  // namespace simcore::telemetry
