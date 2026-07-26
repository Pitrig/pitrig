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

namespace simcore::estimated_lap_time {

inline constexpr std::size_t kTextCapacity = 16;

enum class UnavailableBehavior : std::uint8_t {
  hide,
  placeholder,
};

struct Config {
  std::uint32_t text_color_rgb{0xE8E8E8};
  UnavailableBehavior unavailable_behavior{UnavailableBehavior::placeholder};
  std::array<char, kTextCapacity> placeholder{
      '-', '-', ':', '-', '-', '.', '-', '-', '-', '\0'};
};

struct PresentationState {
  std::array<char, kTextCapacity> text{};
  std::uint32_t color_rgb{};
  bool visible{};
};

// Subscribes to telemetry and initializes immutable presentation state.
[[nodiscard]] bool start(events::EventBus& event_bus,
                         const telemetry::ITelemetryReader& telemetry_reader,
                         const Config& config);

// Returns a coherent immutable copy of the latest presentation state.
[[nodiscard]] PresentationState presentation();

}  // namespace simcore::estimated_lap_time
