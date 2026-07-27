#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#include "driver/uart.h"
#include "esp_log_write.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "transport.hpp"

namespace simcore::transport {

struct UartConfiguration {
  uart_port_t port{UART_NUM_0};
  int tx_pin{UART_PIN_NO_CHANGE};
  int rx_pin{UART_PIN_NO_CHANGE};
  std::uint32_t baud_rate{115'200};
  bool silence_esp_logs{};
};

class UartTransport final : public ITransport {
 public:
  explicit UartTransport(UartConfiguration configuration);
  ~UartTransport() override;

  UartTransport(const UartTransport&) = delete;
  UartTransport& operator=(const UartTransport&) = delete;

  bool start(DataHandler handler, void* context) override;
  void stop() override;

 private:
  static constexpr std::size_t kChunkSize = 512;
  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr std::size_t kDriverRxBufferSize = 2048;

  static void task_entry(void* context);
  static int discard_log_output(const char* format, va_list args);

  void process();
  void restore_log_output();

  UartConfiguration configuration_;
  DataHandler handler_{};
  void* handler_context_{};
  TaskHandle_t task_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  vprintf_like_t previous_log_output_{};
  bool started_{};
};

}  // namespace simcore::transport
