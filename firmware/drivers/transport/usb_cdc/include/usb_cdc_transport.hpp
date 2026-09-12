#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "pitrig_features.hpp"
#include "tinyusb_cdc_acm.h"
#include "transport.hpp"
#include "transport_instrumentation.hpp"

namespace pitrig::transport {

class UsbCdcTransport final : public ITransport {
 public:
  UsbCdcTransport() = default;
  ~UsbCdcTransport() override;

  UsbCdcTransport(const UsbCdcTransport&) = delete;
  UsbCdcTransport& operator=(const UsbCdcTransport&) = delete;

  bool start(DataHandler handler, void* context) override;
  void stop() override;
  bool write(std::span<const std::uint8_t> data) override;
#if PITRIG_DEBUG
  [[nodiscard]] Diagnostics diagnostics() const override;
#endif

 private:
  static constexpr std::size_t kChunkSize = 512;
  static constexpr std::size_t kQueueDepth = 4;
  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr UBaseType_t kTaskPriority = 5;
  static constexpr TickType_t kWriteTimeout = pdMS_TO_TICKS(1'000);
  static constexpr TickType_t kWriteStallTimeout = pdMS_TO_TICKS(100);
  static constexpr TickType_t kWriteFlushTimeout = pdMS_TO_TICKS(50);
  static constexpr TickType_t kReceiveLockTimeout = pdMS_TO_TICKS(50);

  struct Chunk {
    std::array<std::uint8_t, kChunkSize> data{};
    std::size_t size{};
  };

  static void receive_callback(int interface, cdcacm_event_t* event);
  static void task_entry(void* context);

  void receive(TickType_t lock_timeout);
  void process();
  void release_rtos_objects();

  ReadHandler handler_{};
  QueueHandle_t queue_{};
  StaticQueue_t queue_state_{};
  std::array<std::uint8_t, kQueueDepth * sizeof(Chunk)> queue_storage_{};
  SemaphoreHandle_t write_mutex_{};
  StaticSemaphore_t write_mutex_state_{};
  SemaphoreHandle_t receive_mutex_{};
  StaticSemaphore_t receive_mutex_state_{};
  TaskHandle_t task_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  ReadInstrumentation instrumentation_{};
#if PITRIG_DEBUG
  std::atomic<std::uint32_t> queue_overflows_{};
  std::atomic<std::uint32_t> queued_bytes_{};
#endif
  bool started_{};
};

}
