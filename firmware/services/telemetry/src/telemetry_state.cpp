#include "telemetry_state.hpp"

#include <atomic>
#include <cstdint>

#include "esp_timer.h"
#include "pitrig_features.hpp"
#include "telemetry_seqlock.hpp"

namespace pitrig::telemetry {

TelemetryStateService::TelemetryStateService(const ITelemetryRegistry& registry)
    : registry_(registry) {}

CommitResult TelemetryStateService::apply(const TelemetryUpdate& update) {
  const std::lock_guard lock(mutex_);
  if (registry_.describe(update.handle) == nullptr || update.handle.index >= slots_.size()) {
    return {.handle = update.handle, .revision = revision_};
  }
  started_.store(true, std::memory_order_release);
  last_arrival_us_.store(esp_timer_get_time(), std::memory_order_relaxed);

  Slot& slot = slots_[update.handle.index];
  bool changed = slot.available != update.available;
  if (update.available) {
    switch (update.handle.type) {
      case ValueType::text:
        changed = changed || slot.value.source_text != update.value.source_text;
        break;
      case ValueType::uint32:
        changed = changed || slot.value.typed.uint32_value != update.value.typed.uint32_value ||
                  slot.value.source_text != update.value.source_text;
        break;
      case ValueType::int32:
        changed = changed || slot.value.typed.int32_value != update.value.typed.int32_value ||
                  slot.value.source_text != update.value.source_text;
        break;
      case ValueType::float32:
        changed = changed || slot.value.typed.float32_value != update.value.typed.float32_value ||
                  slot.value.source_text != update.value.source_text;
        break;
      case ValueType::boolean:
        changed = changed || slot.value.typed.boolean_value != update.value.typed.boolean_value ||
                  slot.value.source_text != update.value.source_text;
        break;
    }
  }
  if (!changed) {
    return {
        .handle = update.handle,
        .revision = revision_,
    };
  }

  const std::uint32_t sequence = slot.sequence.load(std::memory_order_relaxed);
  slot.sequence.store(sequence + 1, std::memory_order_relaxed);
  std::atomic_thread_fence(std::memory_order_seq_cst);
  slot.available = update.available;
  if (update.available) {
    slot.value = update.value;
  }
  slot.revision = ++revision_;
#if PITRIG_DEBUG
  slot.last_change_us = esp_timer_get_time();
#endif
  std::atomic_thread_fence(std::memory_order_seq_cst);
  slot.sequence.store(sequence + 2, std::memory_order_release);
  return {
      .handle = update.handle,
      .revision = revision_,
      .state_changed = true,
  };
}

TelemetryRead TelemetryStateService::read(const Handle handle) const {
  if (registry_.describe(handle) == nullptr || handle.index >= slots_.size()) {
    return {.handle = handle};
  }

  const Slot& slot = slots_[handle.index];
  return seqlock_read(slot.sequence, [&slot, handle] {
    TelemetryRead result{.handle = handle};
    result.value = slot.value;
    result.revision = slot.revision;
#if PITRIG_DEBUG
    result.last_change_us = slot.last_change_us;
#endif
    result.available = slot.available;
    return result;
  });
}

bool TelemetryStateService::started() const { return started_.load(std::memory_order_acquire); }

std::int64_t TelemetryStateService::last_arrival_us() const {
  return last_arrival_us_.load(std::memory_order_relaxed);
}

}
