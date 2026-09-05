#include "uart_transport.hpp"

#include <span>

#include "esp_err.h"
#include "esp_log.h"
#include "transport_watchdog.hpp"

namespace pitrig::transport {
namespace {

constexpr char kTag[] = "uart_transport";

}

bool UartTransport::configure(const UartConfiguration configuration) {
  if (started_) {
    return false;
  }
  configuration_ = configuration;
  return true;
}

UartTransport::~UartTransport() {
  stop();
}

bool UartTransport::start(const DataHandler handler, void* const context) {
  if (started_ || handler == nullptr) {
    return false;
  }

  if (uart_is_driver_installed(configuration_.port)) {
    if (uart_driver_delete(configuration_.port) != ESP_OK) {
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
#if CONFIG_UART_ISR_IN_IRAM
  constexpr int kInterruptFlags = ESP_INTR_FLAG_IRAM;
#else
  constexpr int kInterruptFlags = 0;
#endif
  if (uart_param_config(configuration_.port, &uart_configuration) != ESP_OK ||
      uart_set_pin(configuration_.port, configuration_.tx_pin,
                   configuration_.rx_pin, UART_PIN_NO_CHANGE,
                   UART_PIN_NO_CHANGE) != ESP_OK ||
      uart_driver_install(configuration_.port, kDriverRxBufferSize, 0,
                          kEventQueueDepth, &event_queue_,
                          kInterruptFlags) != ESP_OK ||
      uart_set_rx_full_threshold(configuration_.port,
                                 kRxFullThresholdBytes) != ESP_OK ||
      uart_set_rx_timeout(configuration_.port, kRxTimeoutSymbols) != ESP_OK) {
    if (uart_is_driver_installed(configuration_.port)) {
      uart_driver_delete(configuration_.port);
    }
    event_queue_ = nullptr;
    return false;
  }

  instrumentation_.reset();
#if PITRIG_DEBUG
  fifo_overflows_.store(0, std::memory_order_relaxed);
  buffer_full_events_.store(0, std::memory_order_relaxed);
#endif
  handler_.bind(handler, context);
  started_ = true;
  task_ = xTaskCreateStaticPinnedToCore(
      &UartTransport::task_entry, "uart_rx", task_stack_.size(), this,
      kTaskPriority, task_stack_.data(), &task_state_,
      PITRIG_COMMUNICATION_CORE);
  if (task_ == nullptr) {
    started_ = false;
    uart_driver_delete(configuration_.port);
    event_queue_ = nullptr;
    handler_.release();
    return false;
  }
  register_read_task(task_);
  return true;
}

void UartTransport::silence_logs() {
  if (started_ && configuration_.silence_esp_logs) {
    log_silencer_.silence();
  }
}

void UartTransport::stop() {
  if (!started_) {
    return;
  }

  started_ = false;
  delete_read_task(task_);
  ESP_ERROR_CHECK_WITHOUT_ABORT(uart_driver_delete(configuration_.port));
  event_queue_ = nullptr;
  handler_.release();
  log_silencer_.restore();
  ESP_LOGI(kTag, "UART telemetry transport stopped");
}

bool UartTransport::write(const std::span<const std::uint8_t> data) {
  if (!started_ || data.empty()) {
    return false;
  }
  return uart_write_bytes(configuration_.port, data.data(), data.size()) ==
         static_cast<int>(data.size());
}

void UartTransport::task_entry(void* const context) {
  static_cast<UartTransport*>(context)->process();
}

void UartTransport::process() {
  std::array<std::uint8_t, kChunkSize> data{};
  uart_event_t event{};
  watch_current_task();
  while (true) {
    const bool has_event =
        xQueueReceive(event_queue_, &event, kWatchdogFeedTicks) == pdTRUE;
    feed_watchdog();
    if (!has_event) {
      continue;
    }

    if (event.type == UART_FIFO_OVF || event.type == UART_BUFFER_FULL) {
      if (event.type == UART_FIFO_OVF) {
#if PITRIG_DEBUG
        fifo_overflows_.fetch_add(1, std::memory_order_relaxed);
#endif
      } else {
#if PITRIG_DEBUG
        buffer_full_events_.fetch_add(1, std::memory_order_relaxed);
#endif
      }
      uart_flush_input(configuration_.port);
      xQueueReset(event_queue_);
      continue;
    }

    if (event.type != UART_DATA) {
      continue;
    }

    while (true) {
      const int received =
          uart_read_bytes(configuration_.port, data.data(), data.size(), 0);
      if (received <= 0) {
        break;
      }

      instrumentation_.record_read(static_cast<std::size_t>(received));
      handler_.dispatch(
          std::span<const std::uint8_t>(data.data(),
                                        static_cast<std::size_t>(received)),
          instrumentation_);
    }
  }
}

#if PITRIG_DEBUG
Diagnostics UartTransport::diagnostics() const {
  Diagnostics diagnostics{};
  instrumentation_.fill(diagnostics);
  std::size_t buffered_bytes = 0;
  if (started_) {
    ESP_ERROR_CHECK_WITHOUT_ABORT(
        uart_get_buffered_data_len(configuration_.port, &buffered_bytes));
  }
  diagnostics.fifo_overflows = fifo_overflows_.load(std::memory_order_relaxed);
  diagnostics.buffer_full_events =
      buffer_full_events_.load(std::memory_order_relaxed);
  diagnostics.buffered_bytes = static_cast<std::uint32_t>(buffered_bytes);
  return diagnostics;
}
#endif

}
