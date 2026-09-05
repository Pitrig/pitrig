#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>

#include "application_configuration.hpp"
#include "event_bus.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"
#include "telemetry_types.hpp"

namespace pitrig::value_smoothing {

class Service;

struct Follower {
  const Service* owner{};
  telemetry::Handle handle{};
  std::atomic<std::uint32_t> sequence{0};
  std::atomic<bool> armed{false};
  float from{};
  float to{};
  float velocity_per_us{};
  std::int64_t segment_start_us{};
  std::int64_t last_sample_us{};
  std::uint64_t revision{};
  std::uint32_t period_us{};
  bool available{};
  bool sampled{};
};

class Service final {
 public:
  static constexpr std::size_t kStorageBytes =
      sizeof(Follower) * telemetry::catalog::kFieldCount + alignof(Follower);

  Service(const telemetry::ITelemetryReader& telemetry,
          events::EventBus& event_bus);
  ~Service();

  Service(const Service&) = delete;
  Service& operator=(const Service&) = delete;

  [[nodiscard]] bool attach(std::span<std::uint8_t> storage);
  [[nodiscard]] bool start(configuration::ValueSmoothing policy);
  void stop();
  [[nodiscard]] bool active() const { return subscription_.valid; }

  [[nodiscard]] Follower* follow(telemetry::Handle handle);
  [[nodiscard]] static telemetry::TelemetryRead read(void* context);

 private:
  struct Motion {
    float from{};
    float to{};
    float velocity_per_us{};
    std::int64_t segment_start_us{};
    std::uint64_t revision{};
    std::uint32_t period_us{};
    bool available{};
    bool sampled{};
  };

  static void on_telemetry_updated(const events::Event& event, void* context);
  static Motion snapshot(const Follower& follower);
  [[nodiscard]] float shown(const Motion& motion, std::int64_t now_us) const;
  void sample(Follower& follower, std::optional<double> numeric,
              std::uint64_t revision, std::int64_t now_us) const;

  const telemetry::ITelemetryReader& telemetry_;
  events::EventBus& event_bus_;
  std::atomic<configuration::ValueSmoothing> policy_{
      configuration::ValueSmoothing::off};
  events::Subscription subscription_{};
  std::span<Follower> followers_{};
};

}
