#include "render_trigger.hpp"

#include "esp_lvgl_port.h"
#include "esp_task_wdt.h"
#include "simcore_features.hpp"

namespace simcore::dashboard::render_trigger {
namespace {

// How often the task comes round when nothing has asked for a pass. Cheap
// enough to be invisible, frequent enough that the watchdog below is fed many
// times over inside its own timeout.
constexpr TickType_t kIdleWakeTicks = pdMS_TO_TICKS(1'000);
// How long the task waits for the LVGL lock before giving up on this round.
// Longer than any pass, any dashboard rebuild and any font pre-warm, so only a
// task that is not giving the lock back at all fails to take it.
constexpr std::uint32_t kLockTimeoutMs = 2'000;

}  // namespace

bool Trigger::start(const WakeHandler handler, void* const context,
                    TaskStorage& task_storage) {
  if (task_ != nullptr || handler == nullptr) {
    return false;
  }
  handler_ = handler;
  context_ = context;
  pending_.store(false, std::memory_order_relaxed);
  task_ = xTaskCreateStaticPinnedToCore(
      &Trigger::task_entry, "render_trigger", task_storage.stack.size(), this,
      kTaskPriority, task_storage.stack.data(), &task_storage.state,
      SIMCORE_COMMUNICATION_CORE);
  if (task_ == nullptr) {
    handler_ = nullptr;
    context_ = nullptr;
    return false;
  }
  return true;
}

void Trigger::request() {
  // Only the first request after a pass started notifies; later ones are
  // covered by that pass or by the one it re-arms.
  if (task_ != nullptr && !pending_.exchange(true, std::memory_order_acq_rel)) {
    xTaskNotifyGive(task_);
  }
}

void Trigger::task_entry(void* const context) {
  static_cast<Trigger*>(context)->process();
}

void Trigger::process() {
  // This task is the firmware's proof that the LVGL task is alive. It cannot
  // watch that task directly — a task can only be fed from inside itself, and
  // the LVGL loop belongs to a vendor component — but it does something just as
  // telling: it takes the LVGL lock every round and only feeds the watchdog
  // once it has it. An LVGL task wedged holding its own lock therefore stops
  // the feeding, and the reset that follows is what puts the link back. A
  // frozen dashboard leaves the board exactly as unreachable as a crashed one.
  (void)esp_task_wdt_add(nullptr);
  while (true) {
    // A bound rather than an idle wait: with no telemetry arriving there is no
    // pass to run, and a task that never runs never feeds.
    (void)ulTaskNotifyTake(pdTRUE, kIdleWakeTicks);
    // Cleared before the pass so a request that lands during it schedules
    // another one instead of being folded into a pass that may already have
    // read the sources. A round woken by the timeout finds nothing pending and
    // takes the lock anyway, which is the probe.
    const bool render = pending_.exchange(false, std::memory_order_acq_rel);
    if (!lvgl_port_lock(kLockTimeoutMs)) {
      continue;
    }
    if (render) {
      handler_(context_);
    }
    lvgl_port_unlock();
    if (render) {
      // The LVGL task may be sleeping until its next timer is due; the readied
      // timers only run once it wakes.
      (void)lvgl_port_task_wake(LVGL_PORT_EVENT_DISPLAY, nullptr);
    }
    (void)esp_task_wdt_reset();
  }
}

}  // namespace simcore::dashboard::render_trigger
