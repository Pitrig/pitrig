#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <mutex>

#include "event_bus.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::estimated_lap_time {

inline constexpr std::size_t kTextCapacity = 16;

enum class UnavailableBehavior : std::uint8_t {
  hide,
  placeholder,
};

struct Config {
  UnavailableBehavior unavailable_behavior{UnavailableBehavior::placeholder};
  std::array<char, kTextCapacity> placeholder{
      '-', '-', ':', '-', '-', '.', '-', '-', '-', '\0'};
};

struct PresentationState {
  std::array<char, kTextCapacity> text{};
  bool visible{};
};

class EstimatedLapTime {
 public:
  EstimatedLapTime() = default;
  ~EstimatedLapTime();

  EstimatedLapTime(const EstimatedLapTime&) = delete;
  EstimatedLapTime& operator=(const EstimatedLapTime&) = delete;
  EstimatedLapTime(EstimatedLapTime&&) = delete;
  EstimatedLapTime& operator=(EstimatedLapTime&&) = delete;

  // Subscribes to telemetry and initializes immutable presentation state.
  [[nodiscard]] bool start(
      events::EventBus& event_bus,
      const telemetry::ITelemetryReader& telemetry_reader,
      const Config& config);
  void stop();

  // Returns a coherent immutable copy of the latest presentation state.
  [[nodiscard]] PresentationState presentation() const;

 private:
  static void on_telemetry_updated(const events::Event& event, void* context);

  void set_unavailable();
  void set_time(std::uint32_t milliseconds);

  Config config_{};
  PresentationState presentation_state_{};
  mutable std::mutex state_mutex_;
  const telemetry::ITelemetryReader* telemetry_reader_{};
  events::EventBus* event_bus_{};
  events::Subscription telemetry_subscription_{};
};

}  // namespace simcore::estimated_lap_time
