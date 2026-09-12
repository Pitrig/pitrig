#include "usb_cdc_transport.hpp"

#include <span>

#include "esp_err.h"
#include "esp_log.h"
#include "sdkconfig.h"
#include "tinyusb.h"
#include "tinyusb_cdc_acm.h"
#include "tinyusb_default_config.h"
#include "transport_watchdog.hpp"
#include "usb_descriptors.hpp"

namespace pitrig::transport {
namespace {

constexpr char kTag[] = "usb_cdc_transport";
static_assert(CFG_TUD_CDC == 1, "The Pitrig USB descriptor defines exactly one CDC function");

#if CONFIG_IDF_TARGET_ESP32P4
constexpr tinyusb_port_t kUsbPort = TINYUSB_PORT_HIGH_SPEED_0;
#else
constexpr tinyusb_port_t kUsbPort = TINYUSB_PORT_FULL_SPEED_0;
#endif
std::atomic<UsbCdcTransport*> active_transport;

}

UsbCdcTransport::~UsbCdcTransport() { stop(); }

bool UsbCdcTransport::start(const DataHandler handler, void* const context) {
  if (started_ || handler == nullptr ||
      active_transport.load(std::memory_order_acquire) != nullptr) {
    return false;
  }

  queue_ = xQueueCreateStatic(kQueueDepth, sizeof(Chunk), queue_storage_.data(), &queue_state_);
  write_mutex_ = xSemaphoreCreateMutexStatic(&write_mutex_state_);
  receive_mutex_ = xSemaphoreCreateMutexStatic(&receive_mutex_state_);
  if (queue_ == nullptr || write_mutex_ == nullptr || receive_mutex_ == nullptr) {
    release_rtos_objects();
    return false;
  }
  usb_descriptors::initialize_serial_number();

  handler_.bind(handler, context);
  instrumentation_.reset();
#if PITRIG_DEBUG
  queue_overflows_.store(0, std::memory_order_relaxed);
  queued_bytes_.store(0, std::memory_order_relaxed);
#endif
  active_transport.store(this, std::memory_order_release);

  const tinyusb_config_t usb_config{
      .port = kUsbPort,
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
              .xCoreID = PITRIG_COMMUNICATION_CORE,
          },
      .descriptor =
          {
              .device = &usb_descriptors::kDevice,
#if TUD_OPT_HIGH_SPEED
              .qualifier = &usb_descriptors::kQualifier,
#else
              .qualifier = nullptr,
#endif
              .string = usb_descriptors::kStrings,
              .string_count = usb_descriptors::kStringCount,
              .full_speed_config = usb_descriptors::kFullSpeedConfiguration,
#if TUD_OPT_HIGH_SPEED
              .high_speed_config = usb_descriptors::kHighSpeedConfiguration,
#else
              .high_speed_config = nullptr,
#endif
          },
      .event_cb = nullptr,
      .event_arg = nullptr,
  };
  if (tinyusb_driver_install(&usb_config) != ESP_OK) {
    active_transport.store(nullptr, std::memory_order_release);
    release_rtos_objects();
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
    active_transport.store(nullptr, std::memory_order_release);
    release_rtos_objects();
    return false;
  }

  task_ = xTaskCreateStaticPinnedToCore(&UsbCdcTransport::task_entry, "usb_cdc_rx",
                                        task_stack_.size(), this, kTaskPriority, task_stack_.data(),
                                        &task_state_, PITRIG_COMMUNICATION_CORE);
  if (task_ == nullptr) {
    tinyusb_cdcacm_deinit(TINYUSB_CDC_ACM_0);
    tinyusb_driver_uninstall();
    active_transport.store(nullptr, std::memory_order_release);
    release_rtos_objects();
    return false;
  }
  register_read_task(task_);
  started_ = true;
  ESP_LOGI(kTag, "Native USB CDC transport started");
  return true;
}

void UsbCdcTransport::stop() {
  if (!started_) {
    return;
  }

  started_ = false;
  active_transport.store(nullptr, std::memory_order_release);
  delete_read_task(task_);
  ESP_ERROR_CHECK_WITHOUT_ABORT(tinyusb_cdcacm_deinit(TINYUSB_CDC_ACM_0));
  ESP_ERROR_CHECK_WITHOUT_ABORT(tinyusb_driver_uninstall());
  handler_.release();
  release_rtos_objects();
  ESP_LOGI(kTag, "Native USB CDC transport stopped");
}

bool UsbCdcTransport::write(const std::span<const std::uint8_t> data) {
  if (!started_ || data.empty() || write_mutex_ == nullptr ||
      xSemaphoreTake(write_mutex_, kWriteTimeout) != pdTRUE) {
    return false;
  }

  const TickType_t started_at = xTaskGetTickCount();
  TickType_t progressed_at = started_at;
  std::size_t position = 0;
  while (position < data.size()) {
    const std::size_t queued = tinyusb_cdcacm_write_queue(TINYUSB_CDC_ACM_0, data.data() + position,
                                                          data.size() - position);
    position += queued;
    (void)tinyusb_cdcacm_write_flush(TINYUSB_CDC_ACM_0, 0);
    if (position == data.size()) {
      break;
    }
    const TickType_t now = xTaskGetTickCount();
    if (queued > 0) {
      progressed_at = now;
      continue;
    }
    if (now - progressed_at >= kWriteStallTimeout || now - started_at >= kWriteTimeout) {
      break;
    }
    vTaskDelay(1);
  }
  const bool complete = position == data.size();
  if (complete) {
    (void)tinyusb_cdcacm_write_flush(TINYUSB_CDC_ACM_0, kWriteFlushTimeout);
  }

  xSemaphoreGive(write_mutex_);
  return complete;
}

void UsbCdcTransport::receive_callback(const int interface, cdcacm_event_t* const event) {
  (void)interface;
  (void)event;
  if (UsbCdcTransport* const transport = active_transport.load(std::memory_order_acquire);
      transport != nullptr) {
    transport->receive(0);
  }
}

void UsbCdcTransport::release_rtos_objects() {
  if (receive_mutex_ != nullptr) {
    vSemaphoreDelete(receive_mutex_);
    receive_mutex_ = nullptr;
  }
  if (write_mutex_ != nullptr) {
    vSemaphoreDelete(write_mutex_);
    write_mutex_ = nullptr;
  }
  if (queue_ != nullptr) {
    vQueueDelete(queue_);
    queue_ = nullptr;
  }
}

void UsbCdcTransport::task_entry(void* const context) {
  static_cast<UsbCdcTransport*>(context)->process();
}

void UsbCdcTransport::receive(const TickType_t lock_timeout) {
  if (queue_ == nullptr || receive_mutex_ == nullptr ||
      xSemaphoreTake(receive_mutex_, lock_timeout) != pdTRUE) {
    return;
  }
  while (uxQueueSpacesAvailable(queue_) > 0) {
    Chunk chunk;
    std::size_t received = 0;
    if (tinyusb_cdcacm_read(TINYUSB_CDC_ACM_0, chunk.data.data(), chunk.data.size(), &received) !=
            ESP_OK ||
        received == 0) {
      break;
    }
    chunk.size = received;
    if (xQueueSend(queue_, &chunk, 0) != pdTRUE) {
#if PITRIG_DEBUG
      queue_overflows_.fetch_add(1, std::memory_order_relaxed);
#endif
      break;
    }
#if PITRIG_DEBUG
    queued_bytes_.fetch_add(static_cast<std::uint32_t>(received), std::memory_order_relaxed);
#endif
    instrumentation_.record_read(static_cast<std::size_t>(received));
  }
  xSemaphoreGive(receive_mutex_);
}

void UsbCdcTransport::process() {
  Chunk chunk;
  watch_current_task();
  while (true) {
    const bool has_chunk = xQueueReceive(queue_, &chunk, kWatchdogFeedTicks) == pdTRUE;
    feed_watchdog();
    if (has_chunk && handler_.bound()) {
#if PITRIG_DEBUG
      queued_bytes_.fetch_sub(static_cast<std::uint32_t>(chunk.size), std::memory_order_relaxed);
#endif
      handler_.dispatch(std::span<const std::uint8_t>(chunk.data.data(), chunk.size),
                        instrumentation_);
    }
    receive(kReceiveLockTimeout);
  }
}

#if PITRIG_DEBUG
Diagnostics UsbCdcTransport::diagnostics() const {
  Diagnostics diagnostics{};
  instrumentation_.fill(diagnostics);
  diagnostics.buffer_full_events = queue_overflows_.load(std::memory_order_relaxed);
  diagnostics.buffered_bytes = queued_bytes_.load(std::memory_order_relaxed);
  return diagnostics;
}
#endif

}
