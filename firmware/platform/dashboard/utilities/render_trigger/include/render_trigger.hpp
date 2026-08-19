#pragma once

#include <array>
#include <atomic>
#include <cstddef>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace simcore::dashboard::render_trigger {

// Invoked on the trigger task with the LVGL lock held. Implementations mark
// widget render timers ready (lv_timer_ready) and return; they must not block.
using WakeHandler = void (*)(void* context);

// Bridges "a source value changed" to "the LVGL task renders now".
//
// Widgets read their sources from LVGL timers, and esp_lvgl_port only runs
// timers whose period elapsed, so without help a change waits for the next
// period. request() is cheap and callable from any task (not from an ISR); the
// trigger task then takes the LVGL lock, lets the handler mark the render timers
// ready, releases the lock, and wakes the LVGL task, whose next pass reads the
// changed values and refreshes. Requests arriving while one is pending coalesce
// into a single pass. No LVGL call happens outside the LVGL lock and the
// requesting task never waits on it.
//
// The trigger has firmware lifetime: it is started once and never stopped.
class Trigger final {
 public:
  static constexpr std::size_t kTaskStackSize = 3072;

  // The task's control block and stack. FreeRTOS requires both in internal
  // RAM, so they are not members of the Trigger — which lives in external RAM
  // with the rest of the dashboard — but are handed in from internal storage
  // the composition keeps for the firmware lifetime.
  struct TaskStorage {
    StaticTask_t state{};
    std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> stack{};
  };

  Trigger() = default;
  Trigger(const Trigger&) = delete;
  Trigger& operator=(const Trigger&) = delete;

  [[nodiscard]] bool start(WakeHandler handler, void* context,
                           TaskStorage& task_storage);
  [[nodiscard]] bool started() const { return task_ != nullptr; }
  void request();

 private:
  // Below the transport tasks and pinned to their core, so a whole received
  // chunk is parsed before the pass it triggers: on that core the trigger
  // cannot run until the transport blocks on its next read.
  static constexpr UBaseType_t kTaskPriority = 4;

  static void task_entry(void* context);
  void process();

  WakeHandler handler_{};
  void* context_{};
  TaskHandle_t task_{};
  std::atomic<bool> pending_{};
};

}  // namespace simcore::dashboard::render_trigger
