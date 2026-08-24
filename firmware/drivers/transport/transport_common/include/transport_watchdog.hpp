#pragma once

#include <cstdint>

#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace simcore::transport {

// Every link's read task is watched by the task watchdog. These tasks are the
// board's only way back to a host, and one that stops draining its queue takes
// telemetry and the control protocol down with it: a board that answers
// nothing is no more reachable than one that crashed, and only a reset puts it
// back. The handler chain runs inline on these tasks — line assembly, protocol
// decode, the control intake — so a fault anywhere in it stops the task here.
//
// The wait each task makes is bounded so an idle link still feeds. A link with
// no host attached receives nothing for hours at a time, and silence on the
// wire is not a fault.
inline constexpr std::uint32_t kWatchdogFeedIntervalMs = 1'000;
inline constexpr TickType_t kWatchdogFeedTicks =
    pdMS_TO_TICKS(kWatchdogFeedIntervalMs);

// Called by the read task itself: a task can only ever be subscribed by, and
// fed from, its own context.
inline void watch_current_task() { (void)esp_task_wdt_add(nullptr); }

inline void feed_watchdog() { (void)esp_task_wdt_reset(); }

// Called before a task is deleted. A subscription outliving its task is a
// timeout on the next sweep. Which of the two is used depends on who does the
// deleting: a link that is stopped from outside deletes another task, and one
// that leaves its own loop deletes itself.
inline void unwatch_task(TaskHandle_t task) {
  if (task != nullptr) {
    (void)esp_task_wdt_delete(task);
  }
}

inline void unwatch_current_task() { (void)esp_task_wdt_delete(nullptr); }

}  // namespace simcore::transport
