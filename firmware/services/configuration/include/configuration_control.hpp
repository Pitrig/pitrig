#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>

#include "configuration_service.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "transport.hpp"

namespace simcore::configuration {

using RebootHandler = void (*)(void* context);

class ConfigurationControl {
 public:
  [[nodiscard]] bool initialize(ConfigurationService& service,
                                transport::ITransport& transport,
                                RebootHandler reboot_handler,
                                void* reboot_context);

  // Queues a line that starts with "@SC:" and has no line terminator. Parsing,
  // validation, and NVS operations run in the dedicated control task.
  void consume(std::span<const std::uint8_t> line);

 private:
  enum class RequestState : std::uint8_t {
    idle,
    writing,
    ready,
  };

  static constexpr std::size_t kIoBufferSize = 16 + kMaximumPayloadSize;
  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr UBaseType_t kTaskPriority = 4;

  static void task_entry(void* context);
  void process();
  void handle(std::span<const std::uint8_t> line);
  void send_text(const char* text);
  void send_error(ValidationError error);
  void send_payload(std::span<const std::uint8_t> payload);

  ConfigurationService* service_{};
  transport::ITransport* transport_{};
  RebootHandler reboot_handler_{};
  void* reboot_context_{};
  TaskHandle_t task_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  // The control task reuses this storage for a response only after it has
  // finished consuming the queued request bytes.
  std::array<std::uint8_t, kIoBufferSize> io_buffer_{};
  std::size_t request_size_{};
  std::atomic<RequestState> request_state_{RequestState::idle};
};

}  // namespace simcore::configuration
