#include "value_smoothing.hpp"

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <memory>

#include "esp_timer.h"
#include "telemetry_events.hpp"
#include "value_conditions.hpp"

namespace simcore::value_smoothing {
namespace {

constexpr std::int64_t kMinimumPeriodUs = 4'000;
constexpr std::int64_t kMaximumPeriodUs = 250'000;
constexpr std::int64_t kShorterPeriodDivisor = 2;
constexpr std::int64_t kLongerPeriodDivisor = 8;

[[nodiscard]] std::uint32_t blend_period(const std::uint32_t period_us,
                                         const std::int64_t gap_us) {
  const std::int64_t gap = std::max(gap_us, kMinimumPeriodUs);
  if (period_us == 0) {
    return static_cast<std::uint32_t>(gap);
  }
  const auto period = static_cast<std::int64_t>(period_us);
  const std::int64_t divisor =
      gap < period ? kShorterPeriodDivisor : kLongerPeriodDivisor;
  return static_cast<std::uint32_t>(period + (gap - period) / divisor);
}

}

Service::Service(const telemetry::ITelemetryReader& telemetry,
                 events::EventBus& event_bus)
    : telemetry_(telemetry), event_bus_(event_bus) {}

Service::~Service() {
  stop();
}

bool Service::attach(const std::span<std::uint8_t> storage) {
  const auto address = reinterpret_cast<std::uintptr_t>(storage.data());
  const std::uintptr_t aligned =
      (address + alignof(Follower) - 1) & ~(alignof(Follower) - 1);
  const std::size_t needed =
      sizeof(Follower) * telemetry::catalog::kFieldCount + (aligned - address);
  if (!followers_.empty() || storage.size() < needed) {
    return false;
  }
  auto* const followers = reinterpret_cast<Follower*>(aligned);
  for (std::size_t index = 0; index < telemetry::catalog::kFieldCount; ++index) {
    Follower& follower = *std::construct_at(followers + index);
    follower.owner = this;
    follower.handle = {
        .index = static_cast<std::uint16_t>(index),
        .type = telemetry::catalog::kFieldDescriptors[index].type,
    };
  }
  followers_ = {followers, telemetry::catalog::kFieldCount};
  return true;
}

bool Service::start(const configuration::ValueSmoothing policy) {
  stop();
  policy_.store(policy, std::memory_order_relaxed);
  if (policy == configuration::ValueSmoothing::off) {
    return true;
  }
  if (followers_.empty()) {
    return false;
  }
  subscription_ = event_bus_.subscribe(telemetry::kTelemetryUpdatedEvent,
                                       &Service::on_telemetry_updated, this);
  return subscription_.valid;
}

void Service::stop() {
  if (subscription_.valid) {
    event_bus_.unsubscribe(subscription_);
  }
  subscription_ = {};
  for (Follower& follower : followers_) {
    follower.armed.store(false, std::memory_order_relaxed);
  }
}

Follower* Service::follow(const telemetry::Handle handle) {
  if (!active() || handle.index >= followers_.size() ||
      handle.type == telemetry::ValueType::boolean ||
      followers_[handle.index].handle.type != handle.type) {
    return nullptr;
  }
  Follower& follower = followers_[handle.index];
  follower.armed.store(true, std::memory_order_release);
  return &follower;
}

Service::Motion Service::snapshot(const Follower& follower) {
  Motion motion{};
  for (;;) {
    const std::uint32_t before =
        follower.sequence.load(std::memory_order_acquire);
    if ((before & 1U) != 0U) {
      continue;
    }
    motion = {
        .from = follower.from,
        .to = follower.to,
        .velocity_per_us = follower.velocity_per_us,
        .segment_start_us = follower.segment_start_us,
        .revision = follower.revision,
        .period_us = follower.period_us,
        .available = follower.available,
        .sampled = follower.sampled,
    };
    std::atomic_thread_fence(std::memory_order_acquire);
    if (follower.sequence.load(std::memory_order_relaxed) == before) {
      return motion;
    }
  }
}

float Service::shown(const Motion& motion, const std::int64_t now_us) const {
  if (motion.period_us == 0) {
    return motion.to;
  }
  const auto period = static_cast<std::int64_t>(motion.period_us);
  const std::int64_t elapsed =
      std::clamp<std::int64_t>(now_us - motion.segment_start_us, 0, period);
  const float progress = static_cast<float>(elapsed) / static_cast<float>(period);
  float target = motion.to;
  if (policy_.load(std::memory_order_relaxed) ==
      configuration::ValueSmoothing::predict) {
    target += motion.velocity_per_us * static_cast<float>(elapsed);
  }
  return motion.from + (target - motion.from) * progress;
}

void Service::sample(Follower& follower, const std::optional<double> numeric,
                     const std::uint64_t revision,
                     const std::int64_t now_us) const {
  const std::uint32_t sequence =
      follower.sequence.load(std::memory_order_relaxed);
  follower.sequence.store(sequence + 1, std::memory_order_relaxed);
  std::atomic_thread_fence(std::memory_order_seq_cst);
  if (!numeric.has_value()) {
    follower.from = follower.to;
    follower.velocity_per_us = 0.0F;
    follower.period_us = 0;
    follower.available = false;
  } else {
    const auto value = static_cast<float>(*numeric);
    const std::int64_t gap_us = now_us - follower.last_sample_us;
    const bool continuous = follower.sampled && follower.available &&
                            gap_us > 0 && gap_us <= kMaximumPeriodUs;
    if (continuous) {
      follower.from = shown(
          {
              .from = follower.from,
              .to = follower.to,
              .velocity_per_us = follower.velocity_per_us,
              .segment_start_us = follower.segment_start_us,
              .period_us = follower.period_us,
          },
          now_us);
      follower.period_us = blend_period(follower.period_us, gap_us);
      follower.velocity_per_us =
          (value - follower.to) / static_cast<float>(gap_us);
    } else {
      follower.from = value;
      follower.period_us = 0;
      follower.velocity_per_us = 0.0F;
    }
    follower.to = value;
    follower.segment_start_us = now_us;
    follower.last_sample_us = now_us;
    follower.available = true;
  }
  follower.sampled = true;
  follower.revision = revision;
  std::atomic_thread_fence(std::memory_order_seq_cst);
  follower.sequence.store(sequence + 2, std::memory_order_release);
}

void Service::on_telemetry_updated(const events::Event& event,
                                   void* const context) {
  auto& service = *static_cast<Service*>(context);
  if (event.payload == nullptr ||
      event.payload_size != sizeof(telemetry::TelemetryUpdated)) {
    return;
  }
  const auto& update =
      *static_cast<const telemetry::TelemetryUpdated*>(event.payload);
  if (update.handle.index >= service.followers_.size()) {
    return;
  }
  Follower& follower = service.followers_[update.handle.index];
  if (!follower.armed.load(std::memory_order_acquire)) {
    return;
  }
  const telemetry::TelemetryRead value =
      service.telemetry_.read(follower.handle);
  service.sample(follower, conditions::condition_value(value), value.revision,
                 esp_timer_get_time());
}

telemetry::TelemetryRead Service::read(void* const context) {
  if (context == nullptr) {
    return {};
  }
  const auto& follower = *static_cast<const Follower*>(context);
  const Motion motion = snapshot(follower);
  if (!motion.sampled) {
    return follower.owner->telemetry_.read(follower.handle);
  }
  telemetry::TelemetryRead result{
      .handle = {.index = follower.handle.index,
                 .type = telemetry::ValueType::float32},
      .revision = motion.revision,
      .available = motion.available,
  };
  result.value.typed.float32_value =
      follower.owner->shown(motion, esp_timer_get_time());
  return result;
}

}
