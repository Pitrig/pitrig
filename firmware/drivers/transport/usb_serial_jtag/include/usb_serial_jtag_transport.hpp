#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "transport.hpp"
#include "transport_instrumentation.hpp"

namespace simcore::transport {

struct UsbSerialJtagConfiguration {
  bool silence_esp_logs{true};
};

class UsbSerialJtagTransport final : public ITransport {
 public:
  UsbSerialJtagTransport() = default;
  ~UsbSerialJtagTransport() override;

  UsbSerialJtagTransport(const UsbSerialJtagTransport&) = delete;
  UsbSerialJtagTransport& operator=(const UsbSerialJtagTransport&) = delete;

  [[nodiscard]] bool configure(UsbSerialJtagConfiguration configuration);
  bool start(DataHandler handler, void* context) override;
  void stop() override;
  bool write(std::span<const std::uint8_t> data) override;
  [[nodiscard]] Diagnostics diagnostics() const override;

  void silence_logs();

 private:
  static constexpr std::size_t kChunkSize = 512;
  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr UBaseType_t kTaskPriority = 5;
  static constexpr std::size_t kDriverRxBufferSize = 2048;
  static constexpr std::size_t kDriverTxBufferSize = 2048;
  static constexpr std::size_t kWriteChunkSize = kDriverTxBufferSize / 2;
  static constexpr TickType_t kWriteTimeout = pdMS_TO_TICKS(1'000);
  static constexpr TickType_t kReadTimeout = pdMS_TO_TICKS(100);

  static void task_entry(void* context);

  void process();
  void release_rtos_objects();

  UsbSerialJtagConfiguration configuration_;
  DataHandler handler_{};
  void* handler_context_{};
  TaskHandle_t task_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  SemaphoreHandle_t stopped_{};
  StaticSemaphore_t stopped_state_{};
  SemaphoreHandle_t write_mutex_{};
  StaticSemaphore_t write_mutex_state_{};
  LogSilencer log_silencer_{};
  std::atomic<bool> running_{false};
  ReadInstrumentation instrumentation_{};
  bool started_{};
};

}
