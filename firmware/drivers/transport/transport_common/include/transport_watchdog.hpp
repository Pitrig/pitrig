#pragma once

#include <cstdint>

#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace pitrig::transport {

inline constexpr std::uint32_t kWatchdogFeedIntervalMs = 1'000;
inline constexpr TickType_t kWatchdogFeedTicks = pdMS_TO_TICKS(kWatchdogFeedIntervalMs);

inline void watch_current_task() { (void)esp_task_wdt_add(nullptr); }

inline void feed_watchdog() { (void)esp_task_wdt_reset(); }

inline void unwatch_task(TaskHandle_t task) {
  if (task != nullptr) {
    (void)esp_task_wdt_delete(task);
  }
}

inline constexpr TickType_t kFloodYieldTicks = pdMS_TO_TICKS(10);

class FloodBreak {
 public:
  void after(const bool more_waiting) {
    if (!more_waiting) {
      streaking_ = false;
      return;
    }
    const TickType_t now = xTaskGetTickCount();
    if (!streaking_) {
      streaking_ = true;
      since_ = now;
    } else if (now - since_ >= kFloodYieldTicks) {
      vTaskDelay(1);
      since_ = xTaskGetTickCount();
    }
  }

 private:
  TickType_t since_{};
  bool streaking_{};
};

}
