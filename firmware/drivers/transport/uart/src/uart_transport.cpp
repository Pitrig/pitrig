#include "uart_transport.hpp"

#include <cstdarg>
#include <span>

#include "esp_err.h"
#include "esp_log.h"
#if SIMCORE_DEBUG
#include "esp_timer.h"
#include "performance.hpp"
#endif

namespace simcore::transport {
namespace {

constexpr char kTag[] = "uart_transport";

#if SIMCORE_DEBUG
void update_maximum(std::atomic<std::uint32_t>& maximum,
                    const std::uint32_t candidate) {
  std::uint32_t current = maximum.load(std::memory_order_relaxed);
  while (candidate > current &&
         !maximum.compare_exchange_weak(current, candidate,
                                        std::memory_order_relaxed)) {
  }
}
#endif

}  // namespace

UartTransport::UartTransport(const UartConfiguration configuration)
    : configuration_(configuration) {}

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
  // With CONFIG_UART_ISR_IN_IRAM the receive interrupt keeps draining the FIFO
  // while flash is being written (configuration save), so a telemetry burst
  // during that window is buffered instead of overflowing the 128-byte FIFO.
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
    restore_log_output();
    return false;
  }

#if SIMCORE_DEBUG
  received_bytes_.store(0, std::memory_order_relaxed);
  read_events_.store(0, std::memory_order_relaxed);
  fifo_overflows_.store(0, std::memory_order_relaxed);
  buffer_full_events_.store(0, std::memory_order_relaxed);
  maximum_read_gap_ms_.store(0, std::memory_order_relaxed);
  maximum_handler_time_us_.store(0, std::memory_order_relaxed);
  last_read_at_us_ = 0;
#endif
  handler_ = handler;
  handler_context_ = context;
  started_ = true;
  task_ = xTaskCreateStatic(&UartTransport::task_entry, "uart_rx",
                            task_stack_.size(), this, kTaskPriority,
                            task_stack_.data(), &task_state_);
  if (task_ == nullptr) {
    started_ = false;
    uart_driver_delete(configuration_.port);
    event_queue_ = nullptr;
    handler_ = nullptr;
    handler_context_ = nullptr;
    restore_log_output();
    return false;
  }
#if SIMCORE_DEBUG
  performance::register_task(performance::TaskMetric::transport, task_);
#endif

  return true;
}

void UartTransport::stop() {
  if (!started_) {
    return;
  }

  started_ = false;
  if (task_ != nullptr) {
#if SIMCORE_DEBUG
    performance::unregister_task(performance::TaskMetric::transport);
#endif
    vTaskDelete(task_);
    task_ = nullptr;
  }
  ESP_ERROR_CHECK_WITHOUT_ABORT(uart_driver_delete(configuration_.port));
  event_queue_ = nullptr;
  handler_ = nullptr;
  handler_context_ = nullptr;
  restore_log_output();
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

int UartTransport::discard_log_output(const char* const format, va_list args) {
  (void)format;
  (void)args;
  return 0;
}

void UartTransport::process() {
  std::array<std::uint8_t, kChunkSize> data{};
  uart_event_t event{};
  while (true) {
    if (xQueueReceive(event_queue_, &event, portMAX_DELAY) != pdTRUE) {
      continue;
    }

    if (event.type == UART_FIFO_OVF || event.type == UART_BUFFER_FULL) {
      if (event.type == UART_FIFO_OVF) {
#if SIMCORE_DEBUG
        fifo_overflows_.fetch_add(1, std::memory_order_relaxed);
#endif
      } else {
#if SIMCORE_DEBUG
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

    // Drain everything the driver has buffered rather than only `event.size`
    // bytes. When the event queue is full the ESP-IDF driver drops the event
    // but keeps the bytes in its ring buffer, so a size-bound read would leave
    // them behind until a later event and every following line would be
    // delivered late. A zero timeout returns whatever is available.
    while (true) {
      const int received =
          uart_read_bytes(configuration_.port, data.data(), data.size(), 0);
      if (received <= 0) {
        break;
      }

#if SIMCORE_DEBUG
      const std::int64_t read_at_us = esp_timer_get_time();
      if (last_read_at_us_ != 0) {
        update_maximum(
            maximum_read_gap_ms_,
            static_cast<std::uint32_t>((read_at_us - last_read_at_us_) / 1'000));
      }
      last_read_at_us_ = read_at_us;
      received_bytes_.fetch_add(static_cast<std::uint64_t>(received),
                                std::memory_order_relaxed);
      read_events_.fetch_add(1, std::memory_order_relaxed);
#endif

      if (handler_ != nullptr) {
#if SIMCORE_DEBUG
        const std::int64_t handler_started_at_us = esp_timer_get_time();
#endif
        handler_(std::span<const std::uint8_t>(
                     data.data(), static_cast<std::size_t>(received)),
                 handler_context_);
#if SIMCORE_DEBUG
        update_maximum(
            maximum_handler_time_us_,
            static_cast<std::uint32_t>(esp_timer_get_time() -
                                       handler_started_at_us));
#endif
      }
    }
  }
}

Diagnostics UartTransport::diagnostics() const {
#if SIMCORE_DEBUG
  std::size_t buffered_bytes = 0;
  if (started_) {
    ESP_ERROR_CHECK_WITHOUT_ABORT(
        uart_get_buffered_data_len(configuration_.port, &buffered_bytes));
  }
  return {
      .received_bytes = received_bytes_.load(std::memory_order_relaxed),
      .read_events = read_events_.load(std::memory_order_relaxed),
      .fifo_overflows = fifo_overflows_.load(std::memory_order_relaxed),
      .buffer_full_events =
          buffer_full_events_.load(std::memory_order_relaxed),
      .buffered_bytes = static_cast<std::uint32_t>(buffered_bytes),
      .maximum_read_gap_ms =
          maximum_read_gap_ms_.load(std::memory_order_relaxed),
      .maximum_handler_time_us =
          maximum_handler_time_us_.load(std::memory_order_relaxed),
  };
#else
  return {};
#endif
}

void UartTransport::restore_log_output() {
  if (previous_log_output_ != nullptr) {
    esp_log_set_vprintf(previous_log_output_);
    previous_log_output_ = nullptr;
  }
}

}  // namespace simcore::transport
