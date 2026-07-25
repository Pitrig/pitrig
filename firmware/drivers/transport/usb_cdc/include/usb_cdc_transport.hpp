#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "tinyusb_cdc_acm.h"
#include "transport.hpp"

namespace simcore::transport {

// Native ESP32-S3 USB CDC transport backed by esp_tinyusb.
class UsbCdcTransport final : public ITransport {
 public:
  UsbCdcTransport() = default;
  ~UsbCdcTransport() override;

  UsbCdcTransport(const UsbCdcTransport&) = delete;
  UsbCdcTransport& operator=(const UsbCdcTransport&) = delete;

  bool start(DataHandler handler, void* context) override;
  void stop() override;

 private:
  static constexpr std::size_t kChunkSize = 512;
  static constexpr std::size_t kQueueDepth = 4;
  static constexpr std::size_t kTaskStackSize = 4096;

  struct Chunk {
    std::array<std::uint8_t, kChunkSize> data{};
    std::size_t size{};
  };

  static void receive_callback(int interface, cdcacm_event_t* event);
  static void task_entry(void* context);

  void receive();
  void process();

  DataHandler handler_{};
  void* handler_context_{};
  QueueHandle_t queue_{};
  StaticQueue_t queue_state_{};
  std::array<std::uint8_t, kQueueDepth * sizeof(Chunk)> queue_storage_{};
  TaskHandle_t task_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  bool started_{};
};

}  // namespace simcore::transport
