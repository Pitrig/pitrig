#include "status_light.hpp"

#include <array>
#include <atomic>
#include <cmath>
#include <numbers>

#include "esp_timer.h"
#include "led_output.hpp"
#include "telemetry_events.hpp"

namespace simcore::status_light {
namespace {

constexpr char kTag[] = "status";
constexpr std::uint64_t kFramePeriodUs = 50'000;
constexpr std::uint64_t kTelemetryIdleUs = 2'000'000;
constexpr std::size_t kMaximumLamps = 8;
constexpr std::uint8_t kDimmed = 40;

constexpr led::Color kBlue{0, 40, 160};
constexpr led::Color kRed{200, 0, 0};
constexpr led::Color kAmber{170, 90, 0};
constexpr led::Color kGreen{0, 150, 30};

std::array<std::uint8_t, kMaximumLamps * 3> working_frame;
std::array<std::uint8_t, kMaximumLamps * 4> wire_frame;

led::Output output;
esp_timer_handle_t timer{};
events::EventBus* bus{};
events::Subscription subscription{};
UploadProbe probe{};
std::atomic<State> state{State::off};
std::atomic<std::uint64_t> last_telemetry_us{};
std::uint64_t started_us{};

void paint_uniform(const led::Color color) {
  for (std::size_t lamp = 0; lamp < output.lamps(); ++lamp) {
    output.set(lamp, color);
  }
}

void paint_upload(const std::uint8_t percent) {
  const std::size_t lamps = output.lamps();
  const std::size_t lit = lamps * percent / 100;
  for (std::size_t lamp = 0; lamp < lamps; ++lamp) {
    output.set(lamp, lamp < lit ? kBlue : kBlue.faded(0.08F));
  }
}

void on_telemetry_updated(const events::Event&, void*) {
  last_telemetry_us.store(static_cast<std::uint64_t>(esp_timer_get_time()));
}

void tick(void*) {
  const auto now = static_cast<std::uint64_t>(esp_timer_get_time());
  const double phase =
      std::fmod(static_cast<double>(now - started_us), 2'000'000.0) / 2'000'000.0;
  const double breath = 0.25 + 0.75 * (0.5 - 0.5 * std::cos(phase * 2.0 *
                                                            std::numbers::pi));

  std::uint8_t percent = 0;
  const UploadProbe watcher = probe;
  if (watcher.read != nullptr && watcher.context != nullptr &&
      watcher.read(watcher.context, percent)) {
    paint_upload(percent);
    if (output.flush({.brightness = 255, .gamma = false})) {
      (void)output.finish(led::kTransmitTimeoutMs);
    }
    return;
  }

  State showing = state.load();
  if (showing == State::running || showing == State::waiting) {
    const std::uint64_t last = last_telemetry_us.load();
    showing = last != 0 && now - last < kTelemetryIdleUs ? State::running
                                                         : State::waiting;
  }

  switch (showing) {
    case State::off:
      paint_uniform({});
      break;
    case State::booting:
      paint_uniform(kBlue.faded(static_cast<float>(breath)));
      break;
    case State::safe_mode:
      paint_uniform(kRed.faded(static_cast<float>(breath)));
      break;
    case State::waiting:
      paint_uniform(kAmber);
      break;
    case State::running:
      paint_uniform(kGreen);
      break;
  }
  if (output.flush({.brightness = kDimmed, .gamma = true})) {
    (void)output.finish(led::kTransmitTimeoutMs);
  }
}

}

bool start(const led::driver::Driver& driver,
           const led::driver::Configuration& configuration,
           events::EventBus& event_bus) {
  if (timer != nullptr || configuration.lamps == 0 ||
      configuration.lamps > kMaximumLamps) {
    return false;
  }
  if (!output.open(driver, configuration, working_frame, wire_frame)) {
    return false;
  }
  bus = &event_bus;
  subscription = event_bus.subscribe(telemetry::kTelemetryUpdatedEvent,
                                     &on_telemetry_updated, nullptr);
  started_us = static_cast<std::uint64_t>(esp_timer_get_time());
  state.store(State::booting);
  const esp_timer_create_args_t args{
      .callback = &tick,
      .arg = nullptr,
      .dispatch_method = ESP_TIMER_TASK,
      .name = kTag,
      .skip_unhandled_events = true,
  };
  if (esp_timer_create(&args, &timer) != ESP_OK ||
      esp_timer_start_periodic(timer, kFramePeriodUs) != ESP_OK) {
    stop();
    return false;
  }
  return true;
}

void set(const State next) { state.store(next); }

void watch_uploads(const UploadProbe& next) { probe = next; }

void stop() {
  if (timer != nullptr) {
    (void)esp_timer_stop(timer);
    (void)esp_timer_delete(timer);
    timer = nullptr;
  }
  if (bus != nullptr && subscription.valid) {
    bus->unsubscribe(subscription);
  }
  subscription = {};
  bus = nullptr;
  probe = {};
  output.close();
}

}
