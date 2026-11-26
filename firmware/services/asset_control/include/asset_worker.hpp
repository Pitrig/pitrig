#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace pitrig::asset_control {

class AssetControl;

inline constexpr std::size_t kReplyCapacity = 2048;

class Worker final {
 public:
  ~Worker();

  [[nodiscard]] bool attach(AssetControl& control);
  [[nodiscard]] bool start();
  void stop();

  [[nodiscard]] bool running() const { return task_ != nullptr; }
  void notify();
  [[nodiscard]] std::span<char> reply_buffer() { return reply_; }

 private:
  static constexpr std::size_t kMaximumControls = 3;
  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr UBaseType_t kTaskPriority = 4;

  static void task_entry(void* context);
  void process();
  [[nodiscard]] TickType_t next_wait() const;

  std::array<AssetControl*, kMaximumControls> controls_{};
  std::size_t control_count_{};
  TaskHandle_t task_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  std::array<char, kReplyCapacity> reply_{};
};

}
