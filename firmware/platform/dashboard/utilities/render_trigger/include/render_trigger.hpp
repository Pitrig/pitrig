#pragma once

#include <array>
#include <atomic>
#include <cstddef>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace pitrig::dashboard::render_trigger {

using WakeHandler = void (*)(void* context);

class Trigger final {
 public:
  static constexpr std::size_t kTaskStackSize = 3072;

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
  static constexpr UBaseType_t kTaskPriority = 4;

  static void task_entry(void* context);
  void process();

  WakeHandler handler_{};
  void* context_{};
  TaskHandle_t task_{};
  std::atomic<bool> pending_{};
};

}
