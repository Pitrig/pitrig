#pragma once

#include <cstdint>

#include "event_bus.hpp"
#include "led_driver.hpp"

namespace pitrig::status_light {

enum class State : std::uint8_t {
  off,
  booting,
  safe_mode,
  waiting,
  running,
};

struct UploadProbe {
  bool (*read)(void* context, std::uint8_t& percent){};
  void* context{};
};

[[nodiscard]] bool start(const led::driver::Driver& driver,
                         const led::driver::Configuration& configuration,
                         events::EventBus& event_bus);

void set(State state);

void watch_uploads(const UploadProbe& probe);

void stop();

}
