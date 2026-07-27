#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <mutex>

#include "event_bus.hpp"

namespace simcore::telemetry {
class ITelemetryReader;
}

namespace simcore::delta_time {

inline constexpr std::size_t kTextCapacity = 16;

enum class UnavailableBehavior : std::uint8_t {
  hide,
  placeholder,
  zero,
};

struct ScaleConfig {
  // Enables a signed center-origin scale.
  bool enabled{false};
  bool show_sign{false};
  // Absolute delta represented by either edge of the scale.
  std::int32_t range_ms{2'000};
};

struct Config {
  UnavailableBehavior unavailable_behavior{UnavailableBehavior::hide};
  std::array<char, kTextCapacity> placeholder{'-', '-', '-', '\0'};
  ScaleConfig scale{};
};

enum class Tone : std::uint8_t {
  neutral,
  faster,
  slower,
};

struct PresentationState {
  std::array<char, kTextCapacity> text{};
  Tone text_tone{Tone::neutral};
  Tone scale_tone{Tone::neutral};
  // Signed fill relative to center: -1000 is full left, +1000 is full right.
  std::int16_t scale_fill_per_mille{};
  bool visible{};
  bool scale_enabled{};
};

class DeltaTime {
 public:
  DeltaTime() = default;
  ~DeltaTime();

  DeltaTime(const DeltaTime&) = delete;
  DeltaTime& operator=(const DeltaTime&) = delete;
  DeltaTime(DeltaTime&&) = delete;
  DeltaTime& operator=(DeltaTime&&) = delete;

  // Subscribes the module to telemetry notifications and initializes its
  // presentation state. Configuration is copied into fixed module storage.
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
  void set_delta(std::int32_t delta_ms);

  Config config_{};
  PresentationState presentation_state_{};
  mutable std::mutex state_mutex_;
  const telemetry::ITelemetryReader* telemetry_reader_{};
  events::EventBus* event_bus_{};
  events::Subscription telemetry_subscription_{};
};

}  // namespace simcore::delta_time
