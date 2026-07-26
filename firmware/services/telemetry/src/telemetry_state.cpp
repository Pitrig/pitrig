#include "telemetry_state.hpp"

#include "esp_timer.h"

namespace simcore::telemetry {
namespace {

template <typename Value>
void apply_field(const Field field,
                 const TelemetryUpdate& update,
                 const Value& incoming,
                 Value& current,
                 Field& valid_fields,
                 Field& changed_fields) {
  if (contains(update.invalid_fields, field)) {
    if (contains(valid_fields, field)) {
      using Fields = std::underlying_type_t<Field>;
      valid_fields = static_cast<Field>(static_cast<Fields>(valid_fields) &
                                        ~static_cast<Fields>(field));
      changed_fields |= field;
    }
    return;
  }

  if (!contains(update.present_fields, field)) {
    return;
  }

  if (!contains(valid_fields, field) || current != incoming) {
    current = incoming;
    changed_fields |= field;
  }
  valid_fields |= field;
}

}  // namespace

CommitResult TelemetryStateService::apply(const TelemetryUpdate& update) {
  const std::lock_guard lock(mutex_);
  Field changed_fields = Field::none;

  apply_field(Field::speed, update, update.values.speed_kph, state_.values.speed_kph,
              state_.valid_fields, changed_fields);
  apply_field(Field::rpm, update, update.values.rpm, state_.values.rpm,
              state_.valid_fields, changed_fields);
  apply_field(Field::gear, update, update.values.gear, state_.values.gear,
              state_.valid_fields, changed_fields);
  apply_field(Field::lap_time_current, update, update.values.lap_time_current_ms,
              state_.values.lap_time_current_ms, state_.valid_fields, changed_fields);
  apply_field(Field::lap_time_best, update, update.values.lap_time_best_ms,
              state_.values.lap_time_best_ms, state_.valid_fields, changed_fields);
  apply_field(Field::fuel, update, update.values.fuel_liters, state_.values.fuel_liters,
              state_.valid_fields, changed_fields);
  apply_field(Field::lap_delta, update, update.values.lap_delta_ms,
              state_.values.lap_delta_ms, state_.valid_fields, changed_fields);
  apply_field(Field::lap_time_estimated, update,
              update.values.lap_time_estimated_ms,
              state_.values.lap_time_estimated_ms, state_.valid_fields,
              changed_fields);

  if (changed_fields != Field::none) {
    ++state_.revision;
    state_.last_change_us = esp_timer_get_time();
  }

  return {
      .changed_fields = changed_fields,
      .revision = state_.revision,
  };
}

TelemetrySnapshot TelemetryStateService::snapshot() const {
  const std::lock_guard lock(mutex_);
  return state_;
}

}  // namespace simcore::telemetry
