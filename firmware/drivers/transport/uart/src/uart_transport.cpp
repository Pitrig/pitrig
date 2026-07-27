#include "uart_transport.hpp"

#include <cstdarg>
#include <span>

#include "esp_err.h"
#include "esp_log.h"

namespace simcore::transport {
namespace {

constexpr char kTag[] = "uart_transport";

}  // namespace

UartTransport::UartTransport(const UartConfiguration configuration)
    : configuration_(configuration) {}

UartTransport::~UartTransport() {
  stop();
}

bool UartTransport::start(const DataHandler handler, void* const context) {
  if (started_ || handler == nullptr) {
    return false;
  }

  if (configuration_.silence_esp_logs) {
    previous_log_output_ = esp_log_set_vprintf(&discard_log_output);
  }

  if (uart_is_driver_installed(configuration_.port)) {
    if (uart_driver_delete(configuration_.port) != ESP_OK) {
      restore_log_output();
      return false;
    }
  }

  const uart_config_t uart_configuration{
      .baud_rate = static_cast<int>(configuration_.baud_rate),
      .data_bits = UART_DATA_8_BITS,
      .parity = UART_PARITY_DISABLE,
      .stop_bits = UART_STOP_BITS_1,
      .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
      .rx_flow_ctrl_thresh = 0,
      .source_clk = UART_SCLK_DEFAULT,
      .flags = {},
  };
  if (uart_param_config(configuration_.port, &uart_configuration) != ESP_OK ||
      uart_set_pin(configuration_.port, configuration_.tx_pin,
                   configuration_.rx_pin, UART_PIN_NO_CHANGE,
                   UART_PIN_NO_CHANGE) != ESP_OK ||
      uart_driver_install(configuration_.port, kDriverRxBufferSize, 0, 0,
                          nullptr, 0) != ESP_OK) {
    restore_log_output();
    return false;
  }

  handler_ = handler;
  handler_context_ = context;
  started_ = true;
  task_ = xTaskCreateStatic(&UartTransport::task_entry, "uart_rx",
                            kTaskStackSize, this, 5, task_stack_.data(),
                            &task_state_);
  if (task_ == nullptr) {
    started_ = false;
    uart_driver_delete(configuration_.port);
    handler_ = nullptr;
    handler_context_ = nullptr;
    restore_log_output();
    return false;
  }

  return true;
}

void UartTransport::stop() {
  if (!started_) {
    return;
  }

  started_ = false;
  if (task_ != nullptr) {
    vTaskDelete(task_);
    task_ = nullptr;
  }
  ESP_ERROR_CHECK_WITHOUT_ABORT(uart_driver_delete(configuration_.port));
  handler_ = nullptr;
  handler_context_ = nullptr;
  restore_log_output();
  ESP_LOGI(kTag, "UART telemetry transport stopped");
}

void UartTransport::task_entry(void* const context) {
  static_cast<UartTransport*>(context)->process();
}

int UartTransport::discard_log_output(const char* const format, va_list args) {
  (void)format;
  (void)args;
  return 0;
}

void UartTransport::process() {
  std::array<std::uint8_t, kChunkSize> data{};
  while (true) {
    const int received =
        uart_read_bytes(configuration_.port, data.data(), data.size(),
                        portMAX_DELAY);
    if (received > 0 && handler_ != nullptr) {
      handler_(std::span<const std::uint8_t>(
                   data.data(), static_cast<std::size_t>(received)),
               handler_context_);
    }
  }
}

void UartTransport::restore_log_output() {
  if (previous_log_output_ != nullptr) {
    esp_log_set_vprintf(previous_log_output_);
    previous_log_output_ = nullptr;
  }
}

}  // namespace simcore::transport
