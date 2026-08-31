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
  ~UartTransport() override;

  UartTransport(const UartTransport&) = delete;
  UartTransport& operator=(const UartTransport&) = delete;

  [[nodiscard]] bool configure(UartConfiguration configuration);
  bool start(DataHandler handler, void* context) override;
  void stop() override;
  bool write(std::span<const std::uint8_t> data) override;
#if SIMCORE_DEBUG
  [[nodiscard]] Diagnostics diagnostics() const override;
#endif

  void silence_logs();

 private:
  static constexpr std::size_t kChunkSize = 512;
  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr std::size_t kEventQueueDepth = 16;
  static constexpr std::size_t kDriverRxBufferSize = 2048;
  static constexpr std::size_t kRxFullThresholdBytes = 8;
  static constexpr std::uint8_t kRxTimeoutSymbols = 1;
  static constexpr UBaseType_t kTaskPriority = 5;

  static void task_entry(void* context);

  void process();

  UartConfiguration configuration_;
  ReadHandler handler_{};
  TaskHandle_t task_{};
  QueueHandle_t event_queue_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  LogSilencer log_silencer_{};
  ReadInstrumentation instrumentation_{};
#if SIMCORE_DEBUG
  std::atomic<std::uint32_t> fifo_overflows_{};
  std::atomic<std::uint32_t> buffer_full_events_{};
#endif
  bool started_{};
};

}
