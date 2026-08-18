#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>

#include "driver/uart.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "simcore_features.hpp"
#include "transport.hpp"
#include "transport_instrumentation.hpp"

namespace simcore::transport {

struct UartConfiguration {
  uart_port_t port{UART_NUM_0};
  int tx_pin{UART_PIN_NO_CHANGE};
  int rx_pin{UART_PIN_NO_CHANGE};
  std::uint32_t baud_rate{921'600};
  bool silence_esp_logs{};
};

class UartTransport final : public ITransport {
 public:
  UartTransport() = default;
  explicit UartTransport(UartConfiguration configuration);
  ~UartTransport() override;

  UartTransport(const UartTransport&) = delete;
  UartTransport& operator=(const UartTransport&) = delete;

  [[nodiscard]] bool configure(UartConfiguration configuration);
  bool start(DataHandler handler, void* context) override;
  void stop() override;
  bool write(std::span<const std::uint8_t> data) override;
  [[nodiscard]] Diagnostics diagnostics() const override;

 private:
  static constexpr std::size_t kChunkSize = 512;
  static constexpr std::size_t kTaskStackSize = 4096;
  // The RX threshold below makes the driver post one event per 8 received
  // bytes, so a burst posts events far faster than a scheduling hiccup lets the
  // task drain them; the queue is deep enough that such a hiccup does not drop
  // events. Each entry is a few bytes.
  static constexpr std::size_t kEventQueueDepth = 16;
  // About 22 ms of continuous data at 921600 baud.
  static constexpr std::size_t kDriverRxBufferSize = 2048;
  // Small threshold + one-symbol timeout: the task is woken within a few byte
  // times of the end of a line, and mid-burst every 8 bytes.
  static constexpr std::size_t kRxFullThresholdBytes = 8;
  static constexpr std::uint8_t kRxTimeoutSymbols = 1;
  static constexpr UBaseType_t kTaskPriority = 5;

  static void task_entry(void* context);

  void process();

  UartConfiguration configuration_;
  DataHandler handler_{};
  void* handler_context_{};
  TaskHandle_t task_{};
  QueueHandle_t event_queue_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  LogSilencer log_silencer_{};
  ReadInstrumentation instrumentation_{};
#if SIMCORE_DEBUG
  // What only a UART has to report: the peripheral FIFO and the driver ring.
  std::atomic<std::uint32_t> fifo_overflows_{};
  std::atomic<std::uint32_t> buffer_full_events_{};
#endif
  bool started_{};
};

}  // namespace simcore::transport
