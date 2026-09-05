#include "transport_instrumentation.hpp"

#include "transport_watchdog.hpp"
#if PITRIG_DEBUG
#include "performance.hpp"
#endif

namespace pitrig::transport {

void register_read_task(const TaskHandle_t task) {
#if PITRIG_DEBUG
  performance::register_task(performance::TaskMetric::transport, task);
#else
  (void)task;
#endif
}

void unregister_read_task() {
#if PITRIG_DEBUG
  performance::unregister_task(performance::TaskMetric::transport);
#endif
}

void delete_read_task(TaskHandle_t& task) {
  if (task == nullptr) {
    return;
  }
  unregister_read_task();
  unwatch_task(task);
  vTaskDelete(task);
  task = nullptr;
}

}
