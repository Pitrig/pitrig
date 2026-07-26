#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace simcore::events {
class EventBus;
}

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

// Subscribes the module to telemetry notifications and initializes its
// presentation state. Configuration is copied into fixed module storage.
[[nodiscard]] bool start(events::EventBus& event_bus,
                         const telemetry::ITelemetryReader& telemetry_reader,
                         const Config& config);

// Returns a coherent immutable copy of the latest presentation state.
[[nodiscard]] PresentationState presentation();

}  // namespace simcore::delta_time
