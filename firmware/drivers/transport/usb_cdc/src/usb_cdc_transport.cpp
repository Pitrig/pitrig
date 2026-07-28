#include "usb_cdc_transport.hpp"

#include <span>

#include "esp_err.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "tinyusb.h"
#include "tinyusb_cdc_acm.h"
#include "tinyusb_default_config.h"

namespace simcore::transport {
namespace {

constexpr char kTag[] = "usb_cdc_transport";
UsbCdcTransport* active_transport;

void update_maximum(std::atomic<std::uint32_t>& maximum,
                    const std::uint32_t candidate) {
  std::uint32_t current = maximum.load(std::memory_order_relaxed);
  while (candidate > current &&
         !maximum.compare_exchange_weak(current, candidate,
                                        std::memory_order_relaxed)) {
  }
}

}  // namespace

UsbCdcTransport::~UsbCdcTransport() {
  stop();
}

bool UsbCdcTransport::start(const DataHandler handler, void* const context) {
  if (started_ || handler == nullptr || active_transport != nullptr) {
    return false;
  }

  queue_ = xQueueCreateStatic(kQueueDepth, sizeof(Chunk), queue_storage_.data(), &queue_state_);
  if (queue_ == nullptr) {
    return false;
  }

  handler_ = handler;
  handler_context_ = context;
  received_bytes_.store(0, std::memory_order_relaxed);
  read_events_.store(0, std::memory_order_relaxed);
  queue_overflows_.store(0, std::memory_order_relaxed);
  queued_bytes_.store(0, std::memory_order_relaxed);
  maximum_read_gap_ms_.store(0, std::memory_order_relaxed);
  maximum_handler_time_us_.store(0, std::memory_order_relaxed);
  last_read_at_us_ = 0;
  active_transport = this;

  const tinyusb_config_t usb_config{
      .port = TINYUSB_PORT_FULL_SPEED_0,
      .phy =
          {
              .skip_setup = false,
              .self_powered = false,
              .vbus_monitor_io = -1,
          },
      .task =
          {
              .size = TINYUSB_DEFAULT_TASK_SIZE,
              .priority = TINYUSB_DEFAULT_TASK_PRIO,
              .xCoreID = TINYUSB_DEFAULT_TASK_AFFINITY,
          },
      .descriptor =
          {
              .device = nullptr,
              .qualifier = nullptr,
              .string = nullptr,
              .string_count = 0,
              .full_speed_config = nullptr,
              .high_speed_config = nullptr,
          },
      .event_cb = nullptr,
      .event_arg = nullptr,
  };
  if (tinyusb_driver_install(&usb_config) != ESP_OK) {
    active_transport = nullptr;
    return false;
  }

  const tinyusb_config_cdcacm_t cdc_config{
      .cdc_port = TINYUSB_CDC_ACM_0,
      .callback_rx = &UsbCdcTransport::receive_callback,
      .callback_rx_wanted_char = nullptr,
      .callback_line_state_changed = nullptr,
      .callback_line_coding_changed = nullptr,
  };
  if (tinyusb_cdcacm_init(&cdc_config) != ESP_OK) {
    tinyusb_driver_uninstall();
    active_transport = nullptr;
    return false;
  }

  task_ = xTaskCreateStatic(&UsbCdcTransport::task_entry, "usb_cdc_rx",
                            task_stack_.size(), this, 5, task_stack_.data(),
                            &task_state_);
  if (task_ == nullptr) {
    tinyusb_cdcacm_deinit(TINYUSB_CDC_ACM_0);
    tinyusb_driver_uninstall();
    active_transport = nullptr;
    return false;
  }

  started_ = true;
  ESP_LOGI(kTag, "Native USB CDC transport started");
  return true;
}

void UsbCdcTransport::stop() {
  if (!started_) {
    return;
  }

  started_ = false;
  active_transport = nullptr;
  if (task_ != nullptr) {
    vTaskDelete(task_);
    task_ = nullptr;
  }
  ESP_ERROR_CHECK_WITHOUT_ABORT(tinyusb_cdcacm_deinit(TINYUSB_CDC_ACM_0));
  ESP_ERROR_CHECK_WITHOUT_ABORT(tinyusb_driver_uninstall());
  handler_ = nullptr;
  handler_context_ = nullptr;
  ESP_LOGI(kTag, "Native USB CDC transport stopped");
}

bool UsbCdcTransport::write(const std::span<const std::uint8_t> data) {
  if (!started_ || data.empty()) {
    return false;
  }
  const std::size_t queued = tinyusb_cdcacm_write_queue(
      TINYUSB_CDC_ACM_0, data.data(), data.size());
  return queued == data.size() &&
         tinyusb_cdcacm_write_flush(TINYUSB_CDC_ACM_0, 0) == ESP_OK;
}

void UsbCdcTransport::receive_callback(const int interface, cdcacm_event_t* const event) {
  (void)interface;
  (void)event;
  if (active_transport != nullptr) {
    active_transport->receive();
  }
}

void UsbCdcTransport::task_entry(void* const context) {
  static_cast<UsbCdcTransport*>(context)->process();
}

void UsbCdcTransport::receive() {
  Chunk chunk;
  std::size_t received = 0;
  const esp_err_t result =
      tinyusb_cdcacm_read(TINYUSB_CDC_ACM_0, chunk.data.data(), chunk.data.size(), &received);
  if (result != ESP_OK || received == 0) {
    return;
  }

  chunk.size = received;
  if (xQueueSend(queue_, &chunk, 0) != pdTRUE) {
    queue_overflows_.fetch_add(1, std::memory_order_relaxed);
    ESP_LOGW(kTag, "RX queue full, dropping %u bytes", static_cast<unsigned>(received));
    return;
  }
  queued_bytes_.fetch_add(static_cast<std::uint32_t>(received),
                          std::memory_order_relaxed);
  received_bytes_.fetch_add(static_cast<std::uint64_t>(received),
                            std::memory_order_relaxed);
  read_events_.fetch_add(1, std::memory_order_relaxed);

  const std::int64_t read_at_us = esp_timer_get_time();
  if (last_read_at_us_ != 0) {
    update_maximum(
        maximum_read_gap_ms_,
        static_cast<std::uint32_t>((read_at_us - last_read_at_us_) / 1'000));
  }
  last_read_at_us_ = read_at_us;
}

void UsbCdcTransport::process() {
  Chunk chunk;
  while (true) {
    if (xQueueReceive(queue_, &chunk, portMAX_DELAY) == pdTRUE && handler_ != nullptr) {
      queued_bytes_.fetch_sub(static_cast<std::uint32_t>(chunk.size),
                              std::memory_order_relaxed);
      const std::int64_t handler_started_at_us = esp_timer_get_time();
      handler_(std::span<const std::uint8_t>(chunk.data.data(), chunk.size), handler_context_);
      update_maximum(
          maximum_handler_time_us_,
          static_cast<std::uint32_t>(esp_timer_get_time() -
                                     handler_started_at_us));
    }
  }
}

Diagnostics UsbCdcTransport::diagnostics() const {
  return {
      .received_bytes = received_bytes_.load(std::memory_order_relaxed),
      .read_events = read_events_.load(std::memory_order_relaxed),
      .fifo_overflows = 0,
      .buffer_full_events =
          queue_overflows_.load(std::memory_order_relaxed),
      .buffered_bytes = queued_bytes_.load(std::memory_order_relaxed),
      .maximum_read_gap_ms =
          maximum_read_gap_ms_.load(std::memory_order_relaxed),
      .maximum_handler_time_us =
          maximum_handler_time_us_.load(std::memory_order_relaxed),
  };
}

}  // namespace simcore::transport
