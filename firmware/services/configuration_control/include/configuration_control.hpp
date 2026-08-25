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
  // The longest request is a command word, a document name and a colon around
  // the widest payload. Thirty-two bytes covers every spelling of both with
  // room left, which is what keeps this one number rather than a computation
  // over the command table.
  static constexpr std::size_t kIoBufferSize = 32 + kMaximumPayloadSize;

  ~ConfigurationControl();

  // Applies a validated replacement to the running composition. It owns the
  // whole sequence — stage, check composability, promote, recompose, revert on
  // failure — because only the application composition can see every piece.
  using ApplyHandler = ValidationFailure (*)(
      ConfigurationDocument document, std::span<const std::uint8_t> payload,
      void* context);

  // Every reply goes to the link the request arrived on, so no transport is
  // taken here: consume() learns which link that is from each line.
  [[nodiscard]] bool initialize(ConfigurationService& service,
                                RebootHandler reboot_handler,
                                void* reboot_context,
                                ApplyHandler apply_handler,
                                void* apply_context,
                                std::span<std::uint8_t> io_buffer);
  void stop();

  // Opens the gate a write waits behind. Startup brings the link up before the
  // dashboard exists, so a document can arrive while there is still nothing to
  // apply it to: reads are answered straight away, which is the whole point of
  // an early link, and a write waits here rather than racing composition. A
  // recovery boot opens it as soon as the link is up, because nothing else is
  // coming.
  void mark_composed();

  // Queues a line that starts with "@SC:" and has no line terminator. Parsing,
  // validation, and NVS operations run in the dedicated control task.
  // The answer goes back out on the link the line arrived on, so the transport
  // is a property of the request rather than of the control service. With one
  // link attached that is the only link there is.
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
  // How long a write waits for composition before it is refused. Startup
  // reaches it in a few hundred milliseconds; anything near this bound means it
  // never will, and the host is better told so than left holding the line.
  static constexpr std::uint32_t kCompositionWaitMs = 10'000;

  static void task_entry(void* context);
  void process();
  void handle(std::span<const std::uint8_t> line);
  // The `INFO` reply: what board this is, what it is running, what became of
  // each stored document, and how the last boot went. Its own file, because it
  // is the one command that reports rather than acts.
  void send_info();
  // The `DIAG` reply: what the running device costs in memory and in frame
  // time. A debug build answers it with live figures; a product build answers
  // `unsupported`, because the sampler those figures come from is not compiled
  // into one. Its own file, for the same reason `INFO` has one.
  void send_diagnostics();
  // Whether the composition a write needs is there yet. False only after the
  // wait above elapsed without it.
  [[nodiscard]] bool await_composition();
  // Splits "<DOCUMENT>" or "<DOCUMENT>:<payload>" off the front of a command
  // argument. Answers the host itself when the name is not one of the three, so
  // callers deal only with a document they can act on.
  [[nodiscard]] bool take_document(std::span<const std::uint8_t> argument,
                                   bool expect_payload,
                                   ConfigurationDocument& document,
                                   std::span<const std::uint8_t>& payload);
  // Every reply goes out through write_reply, which is the one place that
  // knows the link may be absent. They return whether the answer actually
  // reached the host so a caller that can still act on the failure may.
  bool write_reply(std::span<const std::uint8_t> data);
  bool send_text(const char* text);
  bool send_error(const ValidationFailure& failure);
  bool send_payload(ConfigurationDocument document,
                    std::span<const std::uint8_t> payload);
  // "<prefix>:<document>" with an optional trailing field, which is the shape
  // every per-document acknowledgement takes.
  bool send_document_reply(const char* prefix, ConfigurationDocument document,
                           const char* trailer);
  // Where the answer to the request being handled goes.
  [[nodiscard]] transport::ITransport* reply() const { return reply_; }

  ConfigurationService* service_{};
  // Written under the request state below and read only while it is held, so
  // the reply cannot be redirected mid-answer by a request on another link.
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
  // The control task reuses this storage for a response only after it has
  // finished consuming the queued request bytes.
  std::span<std::uint8_t> io_buffer_{};
  std::size_t request_size_{};
  std::atomic<RequestState> request_state_{RequestState::idle};
};

}  // namespace simcore::configuration
