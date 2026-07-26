#include "delta_time.hpp"

#include <algorithm>
#include <cstdio>
#include <mutex>

#include "event_bus.hpp"
#include "telemetry_events.hpp"
#include "telemetry_state.hpp"

namespace simcore::delta_time {
namespace {

Config module_config;
PresentationState presentation_state;
std::mutex state_mutex;
const telemetry::ITelemetryReader* telemetry_reader;
events::Subscription telemetry_subscription;

void set_unavailable() {
  const std::lock_guard lock(state_mutex);
  presentation_state.color_rgb = module_config.neutral_color_rgb;
  presentation_state.scale_color_rgb = module_config.neutral_color_rgb;
  presentation_state.scale_fill_per_mille = 0;
  presentation_state.visible =
      module_config.unavailable_behavior == UnavailableBehavior::placeholder;
  presentation_state.scale_enabled = module_config.scale.enabled;
  presentation_state.text = module_config.placeholder;
  presentation_state.text.back() = '\0';
}

void set_delta(const std::int32_t delta_ms) {
  const std::int64_t magnitude_ms =
      delta_ms < 0 ? -static_cast<std::int64_t>(delta_ms) : delta_ms;
  const std::int64_t magnitude_centiseconds = (magnitude_ms + 5) / 10;

  PresentationState next{};
  next.scale_enabled = module_config.scale.enabled;
  next.scale_color_rgb =
      delta_ms < 0 ? module_config.faster_color_rgb
                   : delta_ms > 0 ? module_config.slower_color_rgb
                                  : module_config.neutral_color_rgb;
  next.color_rgb = module_config.scale.enabled
                       ? module_config.neutral_color_rgb
                       : next.scale_color_rgb;
  next.visible = true;
  if (module_config.scale.enabled) {
    if (module_config.scale.show_sign) {
      const char sign = delta_ms < 0 ? '-' : '+';
      std::snprintf(next.text.data(), next.text.size(), "%c%lld.%02lld", sign,
                    static_cast<long long>(magnitude_centiseconds / 100),
                    static_cast<long long>(magnitude_centiseconds % 100));
    } else {
      std::snprintf(next.text.data(), next.text.size(), "%lld.%02lld",
                    static_cast<long long>(magnitude_centiseconds / 100),
                    static_cast<long long>(magnitude_centiseconds % 100));
    }
    const std::int64_t scaled =
        -static_cast<std::int64_t>(delta_ms) * 1'000 /
        module_config.scale.range_ms;
    next.scale_fill_per_mille = static_cast<std::int16_t>(
        std::clamp<std::int64_t>(scaled, -1'000, 1'000));
  } else {
    const char sign = delta_ms < 0 ? '-' : '+';
    std::snprintf(next.text.data(), next.text.size(), "%c%lld.%02lld", sign,
                  static_cast<long long>(magnitude_centiseconds / 100),
                  static_cast<long long>(magnitude_centiseconds % 100));
  }

  const std::lock_guard lock(state_mutex);
  presentation_state = next;
}

void on_telemetry_updated(const events::Event& event, void*) {
  if (event.payload == nullptr ||
      event.payload_size != sizeof(telemetry::TelemetryUpdated) ||
      telemetry_reader == nullptr) {
    return;
  }

  const auto& update =
      *static_cast<const telemetry::TelemetryUpdated*>(event.payload);
  if (!telemetry::contains(update.changed_fields, telemetry::Field::lap_delta)) {
    return;
  }

  const telemetry::TelemetrySnapshot snapshot = telemetry_reader->snapshot();
  if (!telemetry::contains(snapshot.valid_fields, telemetry::Field::lap_delta)) {
    set_unavailable();
    return;
  }

  set_delta(snapshot.values.lap_delta_ms);
}

}  // namespace

bool start(events::EventBus& event_bus,
           const telemetry::ITelemetryReader& reader,
           const Config& config) {
  module_config = config;
  module_config.placeholder.back() = '\0';
  if (module_config.scale.range_ms <= 0) {
    module_config.scale.range_ms = 2'000;
  }
  telemetry_reader = &reader;
  set_unavailable();

  telemetry_subscription =
      event_bus.subscribe(telemetry::kTelemetryUpdatedEvent,
                          &on_telemetry_updated, nullptr);
  return telemetry_subscription.valid;
}

PresentationState presentation() {
  const std::lock_guard lock(state_mutex);
  return presentation_state;
}

}  // namespace simcore::delta_time
