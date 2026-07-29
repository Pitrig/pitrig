#pragma once

#include <cstdint>
#include <mutex>

#include "event_bus.hpp"
#include "telemetry_types.hpp"

namespace simcore::events {
class EventBus;
}

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::lap_timer {

struct Config {
  // Display only the last received telemetry value without local extrapolation.
  bool telemetry_only{false};
  // Stop local extrapolation when current-lap telemetry is stale for this long.
  std::uint32_t telemetry_timeout_ms{1'000};
};

class LapTimer {
 public:
  LapTimer() = default;
  ~LapTimer();

  LapTimer(const LapTimer&) = delete;
  LapTimer& operator=(const LapTimer&) = delete;
  LapTimer(LapTimer&&) = delete;
  LapTimer& operator=(LapTimer&&) = delete;

  // Subscribes the module to telemetry notifications.
  [[nodiscard]] bool start(
      events::EventBus& event_bus,
      const telemetry::ITelemetryReader& telemetry_reader,
      telemetry::Handle telemetry_handle,
      const Config& config);
  void stop();

  // Returns the latest telemetry value or locally extrapolated time, according
  // to configuration.
  [[nodiscard]] std::uint32_t current_time();

 private:
  struct State {
    std::int64_t current_time_us{};
    std::int64_t pending_correction_us{};
    std::int64_t last_clock_us{};
    std::int64_t last_telemetry_clock_us{};
    std::int64_t telemetry_timeout_us{};
    std::uint32_t last_telemetry_ms{};
    bool initialized{};
    bool telemetry_only{};
  };

  static void on_telemetry_updated(const events::Event& event, void* context);

  void advance_to(std::int64_t now_us);
  void synchronize(std::uint32_t lap_time_ms, std::int64_t now_us);
  void update(std::uint32_t lap_time_ms);

  State state_{};
  std::mutex state_mutex_;
  const telemetry::ITelemetryReader* telemetry_reader_{};
  telemetry::Handle telemetry_handle_{};
  events::EventBus* event_bus_{};
  events::Subscription telemetry_subscription_{};
};

}  // namespace simcore::lap_timer
