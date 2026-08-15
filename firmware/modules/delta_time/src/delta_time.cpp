#include "delta_time.hpp"

#include <algorithm>
#include <cstdio>
#include <mutex>

#include "event_bus.hpp"
#include "telemetry_events.hpp"
#include "telemetry_state.hpp"

namespace simcore::delta_time {

DeltaTime::~DeltaTime() {
  stop();
}

void DeltaTime::set_unavailable() {
  const std::lock_guard lock(state_mutex_);
  presentation_state_.text_tone = Tone::neutral;
  presentation_state_.scale_tone = Tone::neutral;
  presentation_state_.scale_fill_per_mille = 0;
  presentation_state_.visible =
      config_.unavailable_behavior != UnavailableBehavior::hide;
  presentation_state_.scale_enabled = config_.scale.enabled;
  if (config_.unavailable_behavior == UnavailableBehavior::zero) {
    std::snprintf(presentation_state_.text.data(),
                  presentation_state_.text.size(),
                  config_.scale.show_sign ? "+0.00" : "0.00");
  } else {
    presentation_state_.text = config_.placeholder;
    presentation_state_.text.back() = '\0';
  }
}

void DeltaTime::set_delta(const std::int32_t delta_ms) {
  const std::int64_t magnitude_ms =
      delta_ms < 0 ? -static_cast<std::int64_t>(delta_ms) : delta_ms;
  const std::int64_t magnitude_centiseconds = (magnitude_ms + 5) / 10;

  PresentationState next{};
  next.scale_enabled = config_.scale.enabled;
  next.scale_tone =
      delta_ms < 0 ? Tone::faster
                   : delta_ms > 0 ? Tone::slower : Tone::neutral;
  next.text_tone =
      config_.scale.enabled ? Tone::neutral : next.scale_tone;
  next.visible = true;
  if (config_.scale.enabled) {
    if (config_.scale.show_sign) {
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
        config_.scale.range_ms;
    next.scale_fill_per_mille = static_cast<std::int16_t>(
        std::clamp<std::int64_t>(scaled, -1'000, 1'000));
  } else {
    const char sign = delta_ms < 0 ? '-' : '+';
    std::snprintf(next.text.data(), next.text.size(), "%c%lld.%02lld", sign,
                  static_cast<long long>(magnitude_centiseconds / 100),
                  static_cast<long long>(magnitude_centiseconds % 100));
  }

  const std::lock_guard lock(state_mutex_);
  presentation_state_ = next;
}

void DeltaTime::on_telemetry_updated(const events::Event& event,
                                     void* const context) {
  auto& module = *static_cast<DeltaTime*>(context);
  if (event.payload == nullptr ||
      event.payload_size != sizeof(telemetry::TelemetryUpdated) ||
      module.telemetry_reader_ == nullptr) {
    return;
  }

  const auto& update =
      *static_cast<const telemetry::TelemetryUpdated*>(event.payload);
  if (update.handle != module.telemetry_handle_) {
    return;
  }

  const telemetry::TelemetryRead value =
      module.telemetry_reader_->read(module.telemetry_handle_);
  if (!value.available) {
    module.set_unavailable();
    return;
  }

  module.set_delta(value.value.typed.int32_value);
}

bool DeltaTime::start(events::EventBus& event_bus,
                      const telemetry::ITelemetryReader& reader,
                      const telemetry::Handle telemetry_handle,
                      const Config& config) {
  if (telemetry_subscription_.valid || !telemetry_handle.valid() ||
      telemetry_handle.type != telemetry::ValueType::int32) {
    return false;
  }
  config_ = config;
  config_.placeholder.back() = '\0';
  if (config_.scale.range_ms <= 0) {
    config_.scale.range_ms = 2'000;
  }
  telemetry_reader_ = &reader;
  telemetry_handle_ = telemetry_handle;
  event_bus_ = &event_bus;
  set_unavailable();

  telemetry_subscription_ = event_bus.subscribe(
      telemetry::kTelemetryUpdatedEvent, &DeltaTime::on_telemetry_updated, this);
  if (!telemetry_subscription_.valid) {
    telemetry_reader_ = nullptr;
    telemetry_handle_ = {};
    event_bus_ = nullptr;
  }
  return telemetry_subscription_.valid;
}

void DeltaTime::stop() {
  if (event_bus_ != nullptr && telemetry_subscription_.valid) {
    event_bus_->unsubscribe(telemetry_subscription_);
  }
  telemetry_subscription_ = {};
  telemetry_reader_ = nullptr;
  telemetry_handle_ = {};
  event_bus_ = nullptr;
}

PresentationState DeltaTime::presentation() const {
  const std::lock_guard lock(state_mutex_);
  return presentation_state_;
}

}  // namespace simcore::delta_time
