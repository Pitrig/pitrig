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
#include "transport.hpp"

namespace simcore::asset_control {

inline constexpr std::size_t kUploadMaximumChunkSize = 4096;
inline constexpr std::size_t kFrameHeaderSize = 14;
inline constexpr std::size_t kFrameCrcSize = 4;
inline constexpr std::size_t kMaximumFrameSize =
    kFrameHeaderSize + kUploadMaximumChunkSize + kFrameCrcSize;

struct Traits {
  std::string_view tag;
  const char* task_name;
  performance::TaskMetric metric;
};

struct Operations {
  void* service{};
  const char* (*begin_update)(void* service, std::size_t package_size){};
  const char* (*write_update)(void* service,
                              std::span<const std::uint8_t> bytes){};
  const char* (*commit_update)(void* service){};
  const char* (*clear)(void* service){};
  void (*cancel_update)(void* service){};
  int (*write_info_body)(void* service, char* out, std::size_t size){};
};

class AssetControl final {
 public:
  ~AssetControl();

  [[nodiscard]] bool initialize(const Traits& traits,
                                const Operations& operations,
                                binary_session::Claim& claim,
                                std::span<std::uint8_t> frame);

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
    busy,
    frame,
    invalid_frame,
  };

  static constexpr std::size_t kTaskStackSize = 4096;
  static constexpr UBaseType_t kTaskPriority = 4;
  static constexpr TickType_t kInactivityTimeout = pdMS_TO_TICKS(10'000);
  static constexpr std::size_t kCommandCapacity = 32;

  void consume_command(std::span<const std::uint8_t> line,
                       transport::ITransport& reply);
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
  [[nodiscard]] bool send_ok(const char* rest);
  [[nodiscard]] bool send_error(const char* word);
  [[nodiscard]] bool send_ack(std::uint32_t sequence);
  void send_busy(transport::ITransport& reply) const;
  void reset_session();
  [[nodiscard]] bool ready() const;
  [[nodiscard]] transport::ITransport* replies_to() const { return reply_; }

  static void consume_command_entry(void* context,
                                    std::span<const std::uint8_t> line,
                                    transport::ITransport& reply);
  static void consume_entry(void* context,
                            std::span<const std::uint8_t> bytes);

  Traits traits_{};
  Operations operations_{};
  transport::ITransport* requested_reply_{};
  transport::ITransport* reply_{};
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
  std::span<std::uint8_t> frame_{};
  std::size_t frame_size_{};
  std::size_t expected_frame_size_{};
  std::size_t request_frame_size_{};

  std::size_t package_size_{};
  std::size_t received_size_{};
  std::uint32_t expected_sequence_{};
  std::array<char, 1'280> response_{};
};

}
