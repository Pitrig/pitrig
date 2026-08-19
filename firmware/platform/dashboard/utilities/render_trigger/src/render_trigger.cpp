#include "render_trigger.hpp"

#include "esp_lvgl_port.h"
#include "simcore_features.hpp"

namespace simcore::dashboard::render_trigger {

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
  while (true) {
    (void)ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    // Clear before the pass so a request that lands during it schedules
    // another one instead of being folded into a pass that may already have
    // read the sources.
    pending_.store(false, std::memory_order_release);
    if (!lvgl_port_lock(0)) {
      continue;
    }
    handler_(context_);
    lvgl_port_unlock();
    // The LVGL task may be sleeping until its next timer is due; the readied
    // timers only run once it wakes.
    (void)lvgl_port_task_wake(LVGL_PORT_EVENT_DISPLAY, nullptr);
  }
}

}  // namespace simcore::dashboard::render_trigger
