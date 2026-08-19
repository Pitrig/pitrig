#include "usb_cdc_transport.hpp"

#include "usb_descriptors.hpp"

#include <span>

#include "esp_err.h"
#include "esp_log.h"
#if SIMCORE_DEBUG
#include "performance.hpp"
#endif
#include "sdkconfig.h"
#include "tinyusb.h"
#include "tinyusb_cdc_acm.h"
#include "tinyusb_default_config.h"

namespace simcore::transport {
namespace {

constexpr char kTag[] = "usb_cdc_transport";
static_assert(CFG_TUD_CDC == 1,
              "The SimCore USB descriptor defines exactly one CDC function");

#if CONFIG_IDF_TARGET_ESP32P4
constexpr tinyusb_port_t kUsbPort = TINYUSB_PORT_HIGH_SPEED_0;
#else
constexpr tinyusb_port_t kUsbPort = TINYUSB_PORT_FULL_SPEED_0;
#endif
std::atomic<UsbCdcTransport*> active_transport;

}  // namespace

UsbCdcTransport::~UsbCdcTransport() {
  stop();
}

bool UsbCdcTransport::start(const DataHandler handler, void* const context) {
  if (started_ || handler == nullptr ||
      active_transport.load(std::memory_order_acquire) != nullptr) {
    return false;
  }

  queue_ = xQueueCreateStatic(kQueueDepth, sizeof(Chunk),
                              queue_storage_.data(), &queue_state_);
  write_mutex_ = xSemaphoreCreateMutexStatic(&write_mutex_state_);
  if (queue_ == nullptr || write_mutex_ == nullptr) {
    release_rtos_objects();
    return false;
  }

  handler_ = handler;
  handler_context_ = context;
  instrumentation_.reset();
#if SIMCORE_DEBUG
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
              // The port's default is the LVGL core; the receive callback
              // runs on this task, so it belongs with the other transports.
              .xCoreID = SIMCORE_COMMUNICATION_CORE,
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

  task_ = xTaskCreateStatic(&UsbCdcTransport::task_entry, "usb_cdc_rx",
                            task_stack_.size(), this, 5, task_stack_.data(),
                            &task_state_);
  if (task_ == nullptr) {
    tinyusb_cdcacm_deinit(TINYUSB_CDC_ACM_0);
    tinyusb_driver_uninstall();
    active_transport.store(nullptr, std::memory_order_release);
    release_rtos_objects();
    return false;
  }
#if SIMCORE_DEBUG
  performance::register_task(performance::TaskMetric::transport, task_);
#endif

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
  if (task_ != nullptr) {
#if SIMCORE_DEBUG
    performance::unregister_task(performance::TaskMetric::transport);
#endif
    vTaskDelete(task_);
    task_ = nullptr;
  }
  ESP_ERROR_CHECK_WITHOUT_ABORT(tinyusb_cdcacm_deinit(TINYUSB_CDC_ACM_0));
  ESP_ERROR_CHECK_WITHOUT_ABORT(tinyusb_driver_uninstall());
  handler_ = nullptr;
  handler_context_ = nullptr;
  release_rtos_objects();
  ESP_LOGI(kTag, "Native USB CDC transport stopped");
}

bool UsbCdcTransport::write(const std::span<const std::uint8_t> data) {
  if (!started_ || data.empty() || write_mutex_ == nullptr ||
      xSemaphoreTake(write_mutex_, kWriteTimeout) != pdTRUE) {
    return false;
  }

  const TickType_t started_at = xTaskGetTickCount();
  std::size_t position = 0;
  bool complete = true;
  while (position < data.size()) {
    position += tinyusb_cdcacm_write_queue(
        TINYUSB_CDC_ACM_0, data.data() + position, data.size() - position);
    const TickType_t elapsed = xTaskGetTickCount() - started_at;
    if (elapsed >= kWriteTimeout ||
        tinyusb_cdcacm_write_flush(TINYUSB_CDC_ACM_0,
                                   kWriteTimeout - elapsed) != ESP_OK) {
      complete = false;
      break;
    }
  }

  xSemaphoreGive(write_mutex_);
  return complete && position == data.size();
}

void UsbCdcTransport::receive_callback(const int interface,
                                       cdcacm_event_t* const event) {
  (void)interface;
  (void)event;
  if (UsbCdcTransport* const transport =
          active_transport.load(std::memory_order_acquire);
      transport != nullptr) {
    transport->receive();
  }
}

void UsbCdcTransport::release_rtos_objects() {
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

void UsbCdcTransport::receive() {
  Chunk chunk;
  std::size_t received = 0;
  const esp_err_t result =
      tinyusb_cdcacm_read(TINYUSB_CDC_ACM_0, chunk.data.data(),
                          chunk.data.size(), &received);
  if (result != ESP_OK || received == 0) {
    return;
  }

  chunk.size = received;
  if (xQueueSend(queue_, &chunk, 0) != pdTRUE) {
#if SIMCORE_DEBUG
    queue_overflows_.fetch_add(1, std::memory_order_relaxed);
#endif
    ESP_LOGW(kTag, "RX queue full, dropping %u bytes",
             static_cast<unsigned>(received));
    return;
  }
#if SIMCORE_DEBUG
  queued_bytes_.fetch_add(static_cast<std::uint32_t>(received),
                          std::memory_order_relaxed);
#endif
  instrumentation_.record_read(static_cast<std::size_t>(received));
}

void UsbCdcTransport::process() {
  Chunk chunk;
  while (true) {
    if (xQueueReceive(queue_, &chunk, portMAX_DELAY) == pdTRUE &&
        handler_ != nullptr) {
#if SIMCORE_DEBUG
      queued_bytes_.fetch_sub(static_cast<std::uint32_t>(chunk.size),
                              std::memory_order_relaxed);
#endif
      const std::int64_t handler_started_at_us =
          ReadInstrumentation::handler_started();
      handler_(std::span<const std::uint8_t>(chunk.data.data(), chunk.size),
               handler_context_);
      instrumentation_.record_handler(handler_started_at_us);
    }
  }
}

Diagnostics UsbCdcTransport::diagnostics() const {
  Diagnostics diagnostics{};
  instrumentation_.fill(diagnostics);
#if SIMCORE_DEBUG
  diagnostics.buffer_full_events =
      queue_overflows_.load(std::memory_order_relaxed);
  diagnostics.buffered_bytes = queued_bytes_.load(std::memory_order_relaxed);
#endif
  return diagnostics;
}

}  // namespace simcore::transport
