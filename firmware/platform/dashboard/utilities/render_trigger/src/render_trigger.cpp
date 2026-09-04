#include "render_trigger.hpp"

#include "esp_lvgl_port.h"
#include "esp_task_wdt.h"
#include "simcore_features.hpp"

namespace simcore::dashboard::render_trigger {
namespace {

constexpr TickType_t kIdleWakeTicks = pdMS_TO_TICKS(1'000);
constexpr std::uint32_t kLockTimeoutMs = 2'000;

}

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
  if (task_ != nullptr && !pending_.exchange(true, std::memory_order_acq_rel)) {
    xTaskNotifyGive(task_);
  }
}

void Trigger::task_entry(void* const context) {
  static_cast<Trigger*>(context)->process();
}

void Trigger::process() {
  (void)esp_task_wdt_add(nullptr);
  while (true) {
    (void)ulTaskNotifyTake(pdTRUE, kIdleWakeTicks);
    const bool render = pending_.exchange(false, std::memory_order_acq_rel);
    if (!lvgl_port_lock(kLockTimeoutMs)) {
      continue;
    }
    if (render) {
      handler_(context_);
    }
    lvgl_port_unlock();
    if (render && SIMCORE_DISPLAY_VSYNC_LOCK == 0) {
      (void)lvgl_port_task_wake(LVGL_PORT_EVENT_DISPLAY, nullptr);
    }
    (void)esp_task_wdt_reset();
  }
}

}
