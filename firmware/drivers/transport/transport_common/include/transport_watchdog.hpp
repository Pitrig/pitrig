#pragma once

#include <cstdint>

#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace pitrig::transport {

inline constexpr std::uint32_t kWatchdogFeedIntervalMs = 1'000;
inline constexpr TickType_t kWatchdogFeedTicks =
    pdMS_TO_TICKS(kWatchdogFeedIntervalMs);

inline void watch_current_task() { (void)esp_task_wdt_add(nullptr); }

inline void feed_watchdog() { (void)esp_task_wdt_reset(); }

inline void unwatch_task(TaskHandle_t task) {
  if (task != nullptr) {
    (void)esp_task_wdt_delete(task);
  }
}

inline void unwatch_current_task() { (void)esp_task_wdt_delete(nullptr); }

}
