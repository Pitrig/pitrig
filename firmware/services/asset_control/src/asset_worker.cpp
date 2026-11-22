#include "asset_worker.hpp"

#include <algorithm>

#include "asset_control.hpp"
#include "pitrig_features.hpp"
#if PITRIG_DEBUG
#include "performance.hpp"
#endif

namespace pitrig::asset_control {

Worker::~Worker() { stop(); }

bool Worker::attach(AssetControl& control) {
  if (task_ != nullptr || control_count_ == controls_.size()) {
    return false;
  }
  controls_[control_count_++] = &control;
  return true;
}

bool Worker::start() {
  if (task_ != nullptr) {
    return true;
  }
  task_ = xTaskCreateStaticPinnedToCore(&Worker::task_entry, "asset_upload", task_stack_.size(),
                                        this, kTaskPriority, task_stack_.data(), &task_state_,
                                        PITRIG_COMMUNICATION_CORE);
#if PITRIG_DEBUG
  if (task_ != nullptr) {
    performance::register_task(performance::TaskMetric::asset_upload, task_);
  }
#endif
  return task_ != nullptr;
}

void Worker::stop() {
  if (task_ != nullptr) {
#if PITRIG_DEBUG
    performance::unregister_task(performance::TaskMetric::asset_upload);
#endif
    vTaskDelete(task_);
    task_ = nullptr;
  }
  controls_ = {};
  control_count_ = 0;
}

void Worker::notify() {
  if (task_ != nullptr) {
    xTaskNotifyGive(task_);
  }
}

void Worker::task_entry(void* const context) { static_cast<Worker*>(context)->process(); }

void Worker::process() {
  while (true) {
    (void)ulTaskNotifyTake(pdTRUE, next_wait());
    for (std::size_t index = 0; index < control_count_; ++index) {
      controls_[index]->serve();
    }
  }
}

TickType_t Worker::next_wait() const {
  TickType_t wait = portMAX_DELAY;
  for (std::size_t index = 0; index < control_count_; ++index) {
    wait = std::min(wait, controls_[index]->wait_ticks());
  }
  return wait;
}

}
