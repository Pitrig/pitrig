#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

#include "binary_session.hpp"
#include "performance.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "simcore_features.hpp"
#include "transport.hpp"

namespace simcore::asset_control {

inline constexpr std::size_t kUploadMaximumChunkSize = 1024;

// The `SCF1` upload engine, shared by every uploaded asset kind. Fonts and
// images differ in what a package contains and in what INFO reports about it;
// they do not differ in how a package arrives. The framing, the stop-and-wait
// sequence, the CRC, the inactivity timeout, the worker task and the claim on
// the serial link are all the same, so they live here once instead of once per
// kind (ADR 0010, ADR 0018).
//
// This is deliberately not a template: one compiled state machine is one copy
// in the binary, and the per-kind parts are small enough to pass as data.

// The words one asset kind puts on the wire and the task it runs on. Everything
// else about a kind reaches the engine through Operations.
struct Traits {
  // The protocol's word for this kind: `FONT`, `IMAGE`. It is what stands
  // between `@SC:OK:` and the rest of every reply, and what follows `@SC:` in
  // the command namespace.
  std::string_view tag;
  const char* task_name;
  performance::TaskMetric metric;
};

// What the engine asks of an asset service. Each operation reports failure as
// the protocol's error word rather than as an enumerator, because the wire is
// the only place these errors go — and because the two services spell the same
// failures in two separate enumerations.
struct Operations {
  void* service{};
  const char* (*begin_update)(void* service, std::size_t package_size){};
  const char* (*write_update)(void* service,
                              std::span<const std::uint8_t> bytes){};
  const char* (*commit_update)(void* service){};
  const char* (*clear)(void* service){};
  void (*cancel_update)(void* service){};
  // Writes the INFO reply body: everything after `@SC:OK:<tag>:INFO:` and
  // before the newline. Returns the length written, or -1 when it does not
  // fit — which suppresses the reply, so a truncated catalog is never sent.
  int (*write_info_body)(void* service, char* out, std::size_t size){};
};

class AssetControl final {
 public:
  ~AssetControl();

  [[nodiscard]] bool initialize(const Traits& traits,
                                const Operations& operations,
                                transport::ITransport& transport,
                                binary_session::Claim& claim);

  // Registered with the router, which routes by prefix and by who holds the
  // stream rather than by knowing what an asset is.
  [[nodiscard]] const binary_session::Session& session() const {
    return session_;
  }
  void stop();

  [[nodiscard]] bool active() const {
    return session_active_.load(std::memory_order_acquire);
  }

 private:
  enum class RequestState : std::uint8_t {
    idle,
    writing,
    ready,
  };

  enum class RequestType : std::uint8_t {
    begin,
    info,
    clear,
    invalid_command,
    // A BEGIN that arrived while another asset kind owns the stream. Answered
    // from the worker task like every other response.
    busy,
    frame,
    invalid_frame,
  };

  static constexpr std::size_t kFrameHeaderSize = 14;
  static constexpr std::size_t kFrameCrcSize = 4;
  static constexpr std::size_t kMaximumFrameSize =
      kFrameHeaderSize + kUploadMaximumChunkSize + kFrameCrcSize;
  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr UBaseType_t kTaskPriority = 4;
  static constexpr TickType_t kInactivityTimeout = pdMS_TO_TICKS(10'000);
  // `@SC:FONT:BEGIN:size=` and the like, assembled once from the tag so the
  // three command spellings cannot drift from the namespace they live in.
  static constexpr std::size_t kCommandCapacity = 32;

  // Queues an ASCII `@SC:<tag>` command without its line terminator.
#if SIMCORE_SECOND_TELEMETRY_LINK
  // With more than one link attached it is answered on the link it arrived on.
  void consume_command(std::span<const std::uint8_t> line,
                       transport::ITransport& reply);
#else
  void consume_command(std::span<const std::uint8_t> line);
#endif
  // Consumes binary upload frames while active() is true.
  void consume(std::span<const std::uint8_t> bytes);

  static void task_entry(void* context);
  void process();
  void handle_begin();
  void handle_info();
  void handle_clear();
  void handle_frame();
  void queue_request(RequestType type);
  void release_request();
  void finish_with_error(const char* error, bool cancel_update = true);
  [[nodiscard]] bool send_text(const char* text);
  // "@SC:OK:<tag>:<rest>\n" and "@SC:ERR:<tag>:<word>\n": the two shapes
  // every reply but ACK and INFO takes.
  [[nodiscard]] bool send_ok(const char* rest);
  [[nodiscard]] bool send_error(const char* word);
  [[nodiscard]] bool send_ack(std::uint32_t sequence);
  void reset_session();
  [[nodiscard]] bool ready() const;
  // Where the reply to the request being handled goes. With one link that is
  // the only link there is, which is why every send path reads the same in
  // both builds.
  [[nodiscard]] transport::ITransport* replies_to() const {
#if SIMCORE_SECOND_TELEMETRY_LINK
    return reply_;
#else
    return transport_;
#endif
  }

#if SIMCORE_SECOND_TELEMETRY_LINK
  static void consume_command_entry(void* context,
                                    std::span<const std::uint8_t> line,
                                    transport::ITransport& reply);
#else
  static void consume_command_entry(void* context,
                                    std::span<const std::uint8_t> line);
#endif
  static void consume_entry(void* context,
                            std::span<const std::uint8_t> bytes);

  Traits traits_{};
  Operations operations_{};
  transport::ITransport* transport_{};
#if SIMCORE_SECOND_TELEMETRY_LINK
  // Written by a reading task under the request state, then snapshotted by the
  // worker into `reply_` when it takes the request. The worker releases the
  // request state before it answers — so that the next frame can already be
  // arriving — and the snapshot is what keeps that answer pointed at the link
  // that asked rather than at one that queued a command meanwhile.
  transport::ITransport* requested_reply_{};
  transport::ITransport* reply_{};
#endif
  binary_session::Claim* claim_{};
  binary_session::Session session_{};
  std::array<char, kCommandCapacity> command_prefix_{};
  std::array<char, kCommandCapacity> begin_command_{};
  std::array<char, kCommandCapacity> info_command_{};
  std::array<char, kCommandCapacity> clear_command_{};
  TaskHandle_t task_{};
  StaticTask_t task_state_{};
  std::array<StackType_t, kTaskStackSize / sizeof(StackType_t)> task_stack_{};

  std::atomic<bool> session_active_{false};
  std::atomic<bool> overrun_{false};
  std::atomic<RequestState> request_state_{RequestState::idle};
  RequestType request_type_{RequestType::begin};
  std::size_t requested_package_size_{};
  std::array<std::uint8_t, kMaximumFrameSize> frame_{};
  std::size_t frame_size_{};
  std::size_t expected_frame_size_{};
  std::size_t request_frame_size_{};

  std::size_t package_size_{};
  std::size_t received_size_{};
  std::uint32_t expected_sequence_{};
  std::array<char, 1'280> response_{};
};

}  // namespace simcore::asset_control
