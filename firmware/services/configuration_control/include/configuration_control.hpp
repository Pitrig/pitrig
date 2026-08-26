#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>

#include "configuration_service.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"

namespace simcore::transport {
class ITransport;
}

namespace simcore::configuration {

using RebootHandler = void (*)(void* context);

class ConfigurationControl {
 public:
  static constexpr std::size_t kIoBufferSize = 32 + kMaximumPayloadSize;

  ~ConfigurationControl();

  using ApplyHandler = ValidationFailure (*)(
      ConfigurationDocument document, std::span<const std::uint8_t> payload,
      void* context);

  [[nodiscard]] bool initialize(ConfigurationService& service,
                                RebootHandler reboot_handler,
                                void* reboot_context,
                                ApplyHandler apply_handler,
                                void* apply_context,
                                std::span<std::uint8_t> io_buffer);
  void stop();

  void mark_composed();

  void consume(std::span<const std::uint8_t> line,
               transport::ITransport& reply);

 private:
  enum class RequestState : std::uint8_t {
    idle,
    writing,
    ready,
  };

  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr UBaseType_t kTaskPriority = 4;
  static constexpr EventBits_t kComposedBit = 1U << 0U;
  static constexpr std::uint32_t kCompositionWaitMs = 10'000;

  static void task_entry(void* context);
  void process();
  void handle(std::span<const std::uint8_t> line);
  void send_info();
  void send_diagnostics();
  [[nodiscard]] bool await_composition();
  [[nodiscard]] bool take_document(std::span<const std::uint8_t> argument,
                                   bool expect_payload,
                                   ConfigurationDocument& document,
                                   std::span<const std::uint8_t>& payload);
  bool write_reply(std::span<const std::uint8_t> data);
  bool send_text(const char* text);
  bool send_error(const ValidationFailure& failure);
  bool send_payload(ConfigurationDocument document,
                    std::span<const std::uint8_t> payload);
  bool send_document_reply(const char* prefix, ConfigurationDocument document,
                           const char* trailer);
  [[nodiscard]] transport::ITransport* reply() const { return reply_; }

  ConfigurationService* service_{};
  transport::ITransport* reply_{};
  RebootHandler reboot_handler_{};
  ApplyHandler apply_handler_{};
  void* apply_context_{};
  void* reboot_context_{};
  TaskHandle_t task_{};
  StaticTask_t task_state_{};
  EventGroupHandle_t composed_{};
  StaticEventGroup_t composed_storage_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};
  std::span<std::uint8_t> io_buffer_{};
  std::size_t request_size_{};
  std::atomic<RequestState> request_state_{RequestState::idle};
};

}
