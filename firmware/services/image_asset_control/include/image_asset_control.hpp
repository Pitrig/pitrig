#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>

#include "binary_session.hpp"
#include "image_asset_service.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "transport.hpp"

namespace simcore::image_assets {

inline constexpr std::size_t kUploadMaximumChunkSize = 1024;

class ImageAssetControl final {
 public:
  ~ImageAssetControl();

  [[nodiscard]] bool initialize(Service& service,
                                transport::ITransport& transport,
                                binary_session::Claim& claim);

  // Registered with the router, which routes by prefix and by who holds the
  // stream rather than by knowing what a font is.
  [[nodiscard]] const binary_session::Session& session() const {
    return session_;
  }
  void stop();

  // Queues an ASCII @SC:FONT command without its line terminator.
  void consume_command(std::span<const std::uint8_t> line);

  // Consumes binary upload frames while active() is true.
  void consume(std::span<const std::uint8_t> bytes);

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
  [[nodiscard]] bool send_ack(std::uint32_t sequence);
  void reset_session();

  static void consume_command_entry(void* context,
                                    std::span<const std::uint8_t> line);
  static void consume_entry(void* context,
                            std::span<const std::uint8_t> bytes);

  Service* service_{};
  transport::ITransport* transport_{};
  binary_session::Claim* claim_{};
  binary_session::Session session_{};
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

}  // namespace simcore::image_assets
