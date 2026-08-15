#include "telemetry_state.hpp"

#include "esp_timer.h"

namespace simcore::telemetry {

TelemetryStateService::TelemetryStateService(
    const ITelemetryRegistry& registry)
    : registry_(registry) {}

CommitResult TelemetryStateService::apply(const TelemetryUpdate& update) {
  const std::lock_guard lock(mutex_);
  if (registry_.describe(update.handle) == nullptr ||
      update.handle.index >= slots_.size()) {
    return {.handle = update.handle, .revision = revision_};
  }

  Slot& slot = slots_[update.handle.index];
  bool changed = slot.available != update.available;
  if (update.available) {
    switch (update.handle.type) {
      case ValueType::text:
        changed = changed || slot.value.source_text != update.value.source_text;
        break;
      case ValueType::uint32:
        changed = changed ||
                  slot.value.typed.uint32_value !=
                      update.value.typed.uint32_value ||
                  slot.value.source_text != update.value.source_text;
        break;
      case ValueType::int32:
        changed = changed ||
                  slot.value.typed.int32_value !=
                      update.value.typed.int32_value ||
                  slot.value.source_text != update.value.source_text;
        break;
      case ValueType::float32:
        changed = changed ||
                  slot.value.typed.float32_value !=
                      update.value.typed.float32_value ||
                  slot.value.source_text != update.value.source_text;
        break;
      case ValueType::boolean:
        changed = changed ||
                  slot.value.typed.boolean_value !=
                      update.value.typed.boolean_value ||
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

  slot.available = update.available;
  if (update.available) {
    slot.value = update.value;
  }
  slot.revision = ++revision_;
  slot.last_change_us = esp_timer_get_time();
  return {
      .handle = update.handle,
      .revision = revision_,
      .state_changed = true,
  };
}

TelemetryRead TelemetryStateService::read(const Handle handle) const {
  const std::lock_guard lock(mutex_);
  if (registry_.describe(handle) == nullptr || handle.index >= slots_.size()) {
    return {.handle = handle};
  }

  const Slot& slot = slots_[handle.index];
  return {
      .handle = handle,
      .value = slot.value,
      .revision = slot.revision,
      .last_change_us = slot.last_change_us,
      .available = slot.available,
  };
}

}  // namespace simcore::telemetry
