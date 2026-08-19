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
  // The port is also the secondary console, so log lines would interleave with
  // telemetry and control replies. Silencing is global rather than per-output,
  // which is the same trade the UART transport makes.
  bool silence_esp_logs{true};
};

// The ESP32-P4 built-in USB Serial/JTAG controller as a telemetry link. It is
// the port the board is flashed over, and it stays that: download mode is
// entered by the peripheral itself, so installing this driver does not take
// flashing away.
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

 private:
  static constexpr std::size_t kChunkSize = 512;
  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr UBaseType_t kTaskPriority = 5;
  // About 22 ms of continuous data at the rate SimHub sends at. The driver has
  // no event queue, so the task simply blocks in a read.
  static constexpr std::size_t kDriverRxBufferSize = 2048;
  static constexpr std::size_t kDriverTxBufferSize = 2048;
  static constexpr TickType_t kWriteTimeout = pdMS_TO_TICKS(1'000);
  // A blocked read still has to notice a stop, so it wakes periodically
  // instead of waiting forever.
  static constexpr TickType_t kReadTimeout = pdMS_TO_TICKS(100);

  static void task_entry(void* context);

  void process();

  UsbSerialJtagConfiguration configuration_;
  DataHandler handler_{};
  void* handler_context_{};
  TaskHandle_t task_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  // The task blocks inside the driver's ring buffer rather than on a queue this
  // class owns, so it leaves on its own and reports that it has, instead of
  // being deleted out from under a pending reader.
  SemaphoreHandle_t stopped_{};
  StaticSemaphore_t stopped_state_{};
  LogSilencer log_silencer_{};
  std::atomic<bool> running_{false};
  // This port has no FIFO or queue of its own to report on, so the four counters
  // every link shares are all it has.
  ReadInstrumentation instrumentation_{};
  bool started_{};
};

}  // namespace simcore::transport
