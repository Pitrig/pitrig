#include "boot_guard.hpp"

#include <array>
#include <cstddef>

#include "esp_attr.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "logger.hpp"
#include "simcore_features.hpp"

namespace simcore::boot_guard {
namespace {

constexpr char kTag[] = "boot_guard";

constexpr std::uint8_t kFailureThreshold = 3;

constexpr std::uint64_t kStabilityWindowUs = 10'000'000;

constexpr std::uint32_t kRecordMagic = 0x4742'4353U;

struct Record {
  std::uint32_t magic;
  std::uint8_t failures;
  std::uint8_t phase;
  std::uint16_t reserved;
};

RTC_NOINIT_ATTR Record record;

Status current_status;
esp_timer_handle_t stability_timer;

constexpr std::array<std::string_view, 7> kPhaseNames{{
    "none", "configuration", "link", "display", "assets", "composition",
    "complete",
}};

constexpr std::array<std::string_view, 6> kResetCauseNames{{
    "power_on", "software", "panic", "task_watchdog", "brownout", "other",
}};

[[nodiscard]] ResetCause classify(const esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON:
      return ResetCause::power_on;
    case ESP_RST_SW:
      return ResetCause::software;
    case ESP_RST_PANIC:
      return ResetCause::panic;
    case ESP_RST_TASK_WDT:
    case ESP_RST_INT_WDT:
    case ESP_RST_WDT:
      return ResetCause::task_watchdog;
    case ESP_RST_BROWNOUT:
      return ResetCause::brownout;
    default:
      return ResetCause::other;
  }
}

[[nodiscard]] bool counts_as_failure(const ResetCause cause) {
  return cause == ResetCause::panic || cause == ResetCause::task_watchdog;
}

void on_stability_elapsed(void*) { clear_failures(); }

}

std::string_view phase_name(const Phase phase) {
  const auto index = static_cast<std::size_t>(phase);
  return index < kPhaseNames.size() ? kPhaseNames[index] : std::string_view{};
}

std::string_view reset_cause_name(const ResetCause cause) {
  const auto index = static_cast<std::size_t>(cause);
  return index < kResetCauseNames.size() ? kResetCauseNames[index]
                                         : std::string_view{};
}

void begin() {
  const ResetCause cause = classify(esp_reset_reason());
  if (record.magic != kRecordMagic || cause == ResetCause::power_on) {
    record = {
        .magic = kRecordMagic,
        .failures = 0,
        .phase = static_cast<std::uint8_t>(Phase::none),
        .reserved = 0,
    };
  }
  const auto previous_phase =
      record.phase <= static_cast<std::uint8_t>(Phase::complete)
          ? static_cast<Phase>(record.phase)
          : Phase::none;
  if (counts_as_failure(cause) && record.failures < UINT8_MAX) {
    ++record.failures;
  }
  current_status = {
      .safe_mode = record.failures >= kFailureThreshold,
      .consecutive_failures = record.failures,
      .cause = cause,
      .phase = previous_phase,
  };

  const std::string_view cause_name = reset_cause_name(cause);
  const std::string_view failed_in = phase_name(previous_phase);
  if (current_status.safe_mode) {
    log::warn(kTag,
              "Safe mode: %u faults in a row, last was %.*s during %.*s. The "
              "link and the control protocol are up; nothing else is.",
              static_cast<unsigned>(current_status.consecutive_failures),
              static_cast<int>(cause_name.size()), cause_name.data(),
              static_cast<int>(failed_in.size()), failed_in.data());
  } else if (current_status.consecutive_failures > 0) {
    log::warn(kTag, "Recovering from %.*s during %.*s (%u of %u)",
              static_cast<int>(cause_name.size()), cause_name.data(),
              static_cast<int>(failed_in.size()), failed_in.data(),
              static_cast<unsigned>(current_status.consecutive_failures),
              static_cast<unsigned>(kFailureThreshold));
  }
}

const Status& status() { return current_status; }

bool safe_mode() { return current_status.safe_mode; }

void reached(const Phase phase) {
  record.phase = static_cast<std::uint8_t>(phase);
#if SIMCORE_DEBUG
  const std::string_view name = phase_name(phase);
  log::info(kTag, "Phase %.*s at %lu ms", static_cast<int>(name.size()),
            name.data(),
            static_cast<unsigned long>(esp_timer_get_time() / 1'000));
#endif
}

void arm_stability_window() {
  if (stability_timer != nullptr || record.failures == 0) {
    return;
  }
  const esp_timer_create_args_t arguments{
      .callback = &on_stability_elapsed,
      .arg = nullptr,
      .dispatch_method = ESP_TIMER_TASK,
      .name = "boot_guard",
      .skip_unhandled_events = true,
  };
  if (esp_timer_create(&arguments, &stability_timer) != ESP_OK) {
    stability_timer = nullptr;
    return;
  }
  (void)esp_timer_start_once(stability_timer, kStabilityWindowUs);
}

void clear_failures() {
  record.failures = 0;
  current_status.consecutive_failures = 0;
}

}
