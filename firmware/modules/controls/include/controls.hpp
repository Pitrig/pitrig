#pragma once

#include <atomic>
#include <cstdint>

#include "application_configuration.hpp"
#include "configuration_service.hpp"
#include "dashboard_target.hpp"
#include "event_bus.hpp"
#include "telemetry_registry.hpp"
#include "telemetry_state.hpp"

namespace pitrig::controls {

struct Binding;
struct Plan;
struct State;

[[nodiscard]] bool used(const configuration::ApplicationConfiguration& configuration);

class Controls final {
 public:
  Controls() = default;
  ~Controls();
  Controls(const Controls&) = delete;
  Controls& operator=(const Controls&) = delete;

  [[nodiscard]] bool start(events::EventBus& event_bus,
                           const telemetry::ITelemetryRegistry& registry,
                           const telemetry::ITelemetryReader& reader,
                           configuration::ConfigurationService& settings,
                           DashboardTarget* dashboard,
                           const configuration::ApplicationConfiguration& configuration);
  void stop();

  [[nodiscard]] bool running() const { return running_.load(); }

 private:
  static void task_entry(void* context);

  void run();
  void tick(std::uint64_t now_us);
  void follow_buttons(std::uint64_t now_us);
  void press(const Binding& binding, std::uint64_t now_us, bool repeated);
  void release(const Binding& binding);
  void follow_switch();
  void follow_rules();
  void return_home(std::uint64_t now_us);
  void follow_session();
  void store_brightness(std::uint64_t now_us, bool force);
  void step_display(int delta, std::uint64_t now_us);
  void step_leds(int delta, bool toggle);
  void show_screen(std::uint8_t screen);
  void post(const DashboardCommand& command);
  void release_memory();
  [[nodiscard]] std::uint32_t read_unsigned(telemetry::Handle handle) const;
  [[nodiscard]] std::uint8_t active_screen() const;

  events::EventBus* event_bus_{};
  const telemetry::ITelemetryReader* reader_{};
  configuration::ConfigurationService* settings_{};
  DashboardTarget* dashboard_{};
  Plan* plan_{};
  State* state_{};
  std::uint8_t led_percent_{100};
  bool leds_lit_{true};
  std::atomic<bool> running_{};
  std::atomic<bool> finished_{true};
  void* task_{};
};

}
