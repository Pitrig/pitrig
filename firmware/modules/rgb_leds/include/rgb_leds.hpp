#pragma once

#include <atomic>
#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>

#include "application_configuration.hpp"
#include "event_bus.hpp"
#include "led_driver.hpp"
#include "led_geometry.hpp"
#include "led_output.hpp"
#include "telemetry_events.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"

namespace simcore::rgb_leds {

inline constexpr std::size_t kMaximumOutputs =
    configuration::kMaximumHardwareDevices;
inline constexpr std::size_t kMaximumEffects = configuration::kMaximumLedEffects;

struct EffectBinding;
struct EffectState;

class RgbLeds final {
 public:
  RgbLeds() = default;
  ~RgbLeds();
  RgbLeds(const RgbLeds&) = delete;
  RgbLeds& operator=(const RgbLeds&) = delete;

  [[nodiscard]] bool start(
      events::EventBus& event_bus,
      const telemetry::ITelemetryRegistry& registry,
      const telemetry::ITelemetryReader& reader,
      const led::driver::Driver& driver,
      const configuration::ApplicationConfiguration& configuration);
  void stop();

  [[nodiscard]] bool running() const { return running_.load(); }

 private:
  static void on_telemetry_updated(const events::Event& event, void* context);
  static void task_entry(void* context);

  [[nodiscard]] bool reserve_frames(
      const configuration::ApplicationConfiguration& configuration);
  void release_frames();
  void teardown();

  void run();
  void render(std::uint64_t now_us);
  [[nodiscard]] bool paint_output(std::size_t output, std::uint64_t now_us);
  [[nodiscard]] bool gate_holds(std::size_t output, std::size_t effect,
                                std::optional<double> watched,
                                std::uint64_t now_us);

  const telemetry::ITelemetryReader* reader_{};
  events::EventBus* event_bus_{};
  events::Subscription telemetry_subscription_{};

  std::array<const configuration::HardwareDeviceConfiguration*, kMaximumOutputs>
      devices_{};
  std::array<led::Matrix, kMaximumOutputs> geometry_{};
  std::array<led::Output, kMaximumOutputs> outputs_{};
  std::array<bool, kMaximumOutputs> pushed_{};
  std::array<bool, kMaximumOutputs> in_flight_{};
  configuration::HardwareDeviceConfiguration* device_store_{};
  EffectBinding* bindings_{};
  EffectState* states_{};
  std::uint8_t output_count_{};
  std::uint8_t* working_{};
  std::uint8_t* shadow_{};
  std::uint8_t* wire_{};
  std::size_t working_bytes_{};
  std::size_t wire_bytes_{};

  std::atomic<std::uint64_t> last_telemetry_us_{};
  std::atomic<bool> running_{};
  std::atomic<bool> finished_{true};
  void* task_{};
};

}
