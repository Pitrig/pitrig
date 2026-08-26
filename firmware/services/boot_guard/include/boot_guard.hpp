#pragma once

#include <cstdint>
#include <string_view>

namespace simcore::boot_guard {

enum class Phase : std::uint8_t {
  none,
  configuration,
  link,
  display,
  assets,
  composition,
  complete,
};

enum class ResetCause : std::uint8_t {
  power_on,
  software,
  panic,
  task_watchdog,
  brownout,
  other,
};

struct Status {
  bool safe_mode{};
  std::uint8_t consecutive_failures{};
  ResetCause cause{};
  Phase phase{};
};

[[nodiscard]] std::string_view phase_name(Phase phase);
[[nodiscard]] std::string_view reset_cause_name(ResetCause cause);

void begin();

[[nodiscard]] const Status& status();
[[nodiscard]] bool safe_mode();

void reached(Phase phase);

void arm_stability_window();

void clear_failures();

}
