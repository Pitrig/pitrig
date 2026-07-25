#include "usb_cdc_transport.hpp"

#include <span>

#include "esp_err.h"
#include "esp_log.h"
#include "tinyusb.h"
#include "tinyusb_cdc_acm.h"
#include "tinyusb_default_config.h"

namespace simcore::transport {
namespace {

constexpr char kTag[] = "usb_cdc_transport";
UsbCdcTransport* active_transport;

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
                            kTaskStackSize, this, 5, task_stack_.data(), &task_state_);
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
    ESP_LOGW(kTag, "RX queue full, dropping %u bytes", static_cast<unsigned>(received));
  }
}

void UsbCdcTransport::process() {
  Chunk chunk;
  while (true) {
    if (xQueueReceive(queue_, &chunk, portMAX_DELAY) == pdTRUE && handler_ != nullptr) {
      handler_(std::span<const std::uint8_t>(chunk.data.data(), chunk.size), handler_context_);
    }
  }
}

}  // namespace simcore::transport
