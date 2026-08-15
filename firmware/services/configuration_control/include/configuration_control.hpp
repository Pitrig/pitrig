#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>

#include "configuration_service.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace simcore::transport {
class ITransport;
}

namespace simcore::configuration {

using RebootHandler = void (*)(void* context);

class ConfigurationControl {
 public:
  static constexpr std::size_t kIoBufferSize = 16 + kMaximumPayloadSize;

  ~ConfigurationControl();

  // Applies a validated replacement to the running composition. It owns the
  // whole sequence — stage, check composability, promote, recompose, revert on
  // failure — because only the application composition can see every piece.
  using ApplyHandler = ValidationFailure (*)(
      std::span<const std::uint8_t> payload, void* context);

  [[nodiscard]] bool initialize(ConfigurationService& service,
                                transport::ITransport& transport,
                                RebootHandler reboot_handler,
                                void* reboot_context,
                                ApplyHandler apply_handler,
                                void* apply_context,
                                std::span<std::uint8_t> io_buffer);
  void stop();

  // Queues a line that starts with "@SC:" and has no line terminator. Parsing,
  // validation, and NVS operations run in the dedicated control task.
  void consume(std::span<const std::uint8_t> line);

 private:
  enum class RequestState : std::uint8_t {
    idle,
    writing,
    ready,
  };

  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr UBaseType_t kTaskPriority = 4;

  static void task_entry(void* context);
  void process();
  void handle(std::span<const std::uint8_t> line);
  void send_text(const char* text);
  void send_error(const ValidationFailure& failure);
  void send_payload(std::span<const std::uint8_t> payload);

  ConfigurationService* service_{};
  transport::ITransport* transport_{};
  RebootHandler reboot_handler_{};
  ApplyHandler apply_handler_{};
  void* apply_context_{};
  void* reboot_context_{};
  TaskHandle_t task_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  // The control task reuses this storage for a response only after it has
  // finished consuming the queued request bytes.
  std::span<std::uint8_t> io_buffer_{};
  std::size_t request_size_{};
  std::atomic<RequestState> request_state_{RequestState::idle};
};

}  // namespace simcore::configuration
