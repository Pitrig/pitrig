#include "asset_control.hpp"

#include <algorithm>
#include <charconv>
#include <cstdio>
#include <cstring>

#include "binary_codec.hpp"
#include "crc32.hpp"
#include "simcore_features.hpp"

namespace simcore::asset_control {
namespace {

constexpr std::array<std::uint8_t, 4> kFrameMagic{'S', 'C', 'F', '1'};
constexpr std::size_t kFrameTypeOffset = 4;
constexpr std::size_t kFrameReservedByteOffset = 5;
constexpr std::size_t kFrameSequenceOffset = 6;
constexpr std::size_t kFramePayloadLengthOffset = 10;
constexpr std::size_t kFrameReservedWordOffset = 12;

enum class FrameType : std::uint8_t {
  data = 1,
  commit = 2,
  cancel = 3,
};

[[nodiscard]] bool valid_header(const std::span<const std::uint8_t> header) {
  if (header.size() != 14 ||
      !std::equal(kFrameMagic.begin(), kFrameMagic.end(), header.begin()) ||
      header[kFrameReservedByteOffset] != 0 ||
      binary::read_u16_le(header, kFrameReservedWordOffset) != 0) {
    return false;
  }
  const auto type = static_cast<FrameType>(header[kFrameTypeOffset]);
  const std::size_t payload_size =
      binary::read_u16_le(header, kFramePayloadLengthOffset);
  if (type == FrameType::data) {
    return payload_size > 0 && payload_size <= kUploadMaximumChunkSize;
  }
  return (type == FrameType::commit || type == FrameType::cancel) &&
         payload_size == 0;
}

[[nodiscard]] bool matches(const std::span<const std::uint8_t> line,
                           const std::string_view command) {
  return line.size() == command.size() &&
         std::equal(command.begin(), command.end(), line.begin());
}

// Fills one of the command spellings from the tag, e.g. `@SC:FONT:INFO`.
std::string_view compose(std::array<char, 32>& storage,
                         const std::string_view tag,
                         const std::string_view suffix) {
  const int written =
      std::snprintf(storage.data(), storage.size(), "@SC:%.*s:%.*s",
                    static_cast<int>(tag.size()), tag.data(),
                    static_cast<int>(suffix.size()), suffix.data());
  if (written <= 0 || static_cast<std::size_t>(written) >= storage.size()) {
    return {};
  }
  return {storage.data(), static_cast<std::size_t>(written)};
}

}  // namespace

AssetControl::~AssetControl() { stop(); }

void AssetControl::consume_command_entry(
    void* const context, const std::span<const std::uint8_t> line) {
  static_cast<AssetControl*>(context)->consume_command(line);
}

void AssetControl::consume_entry(void* const context,
                                 const std::span<const std::uint8_t> bytes) {
  static_cast<AssetControl*>(context)->consume(bytes);
}

bool AssetControl::initialize(const Traits& traits,
                              const Operations& operations,
                              transport::ITransport& transport,
                              binary_session::Claim& claim) {
  if (task_ != nullptr) {
    return false;
  }
  traits_ = traits;
  operations_ = operations;
  transport_ = &transport;
  claim_ = &claim;
  // The namespace ends in a colon and carries no command, which is what the
  // router matches a line against before this ever sees it.
  const int prefix_length =
      std::snprintf(command_prefix_.data(), command_prefix_.size(), "@SC:%.*s:",
                    static_cast<int>(traits_.tag.size()), traits_.tag.data());
  if (prefix_length <= 0 ||
      static_cast<std::size_t>(prefix_length) >= command_prefix_.size() ||
      compose(begin_command_, traits_.tag, "BEGIN:size=").empty() ||
      compose(info_command_, traits_.tag, "INFO").empty() ||
      compose(clear_command_, traits_.tag, "CLEAR").empty()) {
    return false;
  }
  session_ = {
      .command_prefix = {command_prefix_.data(),
                         static_cast<std::size_t>(prefix_length)},
      .consume_command = &AssetControl::consume_command_entry,
      .consume = &AssetControl::consume_entry,
      .context = this,
  };
  reset_session();
  request_state_.store(RequestState::idle, std::memory_order_relaxed);
  task_ = xTaskCreateStatic(&AssetControl::task_entry, traits_.task_name,
                            task_stack_.size(), this, kTaskPriority,
                            task_stack_.data(), &task_state_);
  if (task_ != nullptr) {
#if SIMCORE_DEBUG
    performance::register_task(traits_.metric, task_);
#endif
  } else {
    stop();
  }
  return task_ != nullptr;
}

void AssetControl::stop() {
  if (task_ != nullptr) {
#if SIMCORE_DEBUG
    performance::unregister_task(traits_.metric);
#endif
    vTaskDelete(task_);
    task_ = nullptr;
  }
  if (operations_.service != nullptr && active()) {
    operations_.cancel_update(operations_.service);
  }
  reset_session();
  request_state_.store(RequestState::idle, std::memory_order_release);
  frame_size_ = 0;
  expected_frame_size_ = 0;
  request_frame_size_ = 0;
  operations_ = {};
  transport_ = nullptr;
}

bool AssetControl::ready() const {
  return operations_.service != nullptr && transport_ != nullptr &&
         task_ != nullptr;
}

void AssetControl::consume_command(const std::span<const std::uint8_t> line) {
  if (!ready() || active()) {
    return;
  }

  RequestState expected = RequestState::idle;
  if (!request_state_.compare_exchange_strong(
          expected, RequestState::writing, std::memory_order_acquire,
          std::memory_order_relaxed)) {
    return;
  }

  const std::string_view begin_prefix{
      begin_command_.data(), std::strlen(begin_command_.data())};
  requested_package_size_ = 0;
  if (matches(line, {info_command_.data(), std::strlen(info_command_.data())})) {
    request_type_ = RequestType::info;
  } else if (matches(line, {clear_command_.data(),
                            std::strlen(clear_command_.data())})) {
    request_type_ = RequestType::clear;
  } else if (line.size() >= begin_prefix.size() &&
             std::equal(begin_prefix.begin(), begin_prefix.end(),
                        line.begin())) {
    const auto value = line.subspan(begin_prefix.size());
    const auto* const begin = reinterpret_cast<const char*>(value.data());
    const auto* const end = begin + value.size();
    const auto result =
        std::from_chars(begin, end, requested_package_size_, 10);
    if (result.ec != std::errc{} || result.ptr != end) {
      requested_package_size_ = 0;
    }
    // Taken here, on the task that reads the bytes, so a second upload
    // arriving mid-handshake finds the stream owned rather than a flag that
    // has not been set yet.
    if (claim_ != nullptr && !claim_->try_claim(&session_)) {
      request_type_ = RequestType::busy;
    } else {
      session_active_.store(true, std::memory_order_release);
      request_type_ = RequestType::begin;
    }
  } else {
    request_type_ = RequestType::invalid_command;
  }

  frame_size_ = 0;
  expected_frame_size_ = 0;
  overrun_.store(false, std::memory_order_relaxed);
  request_state_.store(RequestState::ready, std::memory_order_release);
  xTaskNotifyGive(task_);
}

void AssetControl::consume(const std::span<const std::uint8_t> bytes) {
  if (!active() || bytes.empty()) {
    return;
  }
  if (request_state_.load(std::memory_order_acquire) != RequestState::idle) {
    overrun_.store(true, std::memory_order_release);
    xTaskNotifyGive(task_);
    return;
  }

  for (std::size_t index = 0; index < bytes.size(); ++index) {
    if (frame_size_ == frame_.size()) {
      queue_request(RequestType::invalid_frame);
      return;
    }
    frame_[frame_size_++] = bytes[index];
    if (frame_size_ == kFrameHeaderSize) {
      const auto header =
          std::span<const std::uint8_t>(frame_.data(), kFrameHeaderSize);
      if (!valid_header(header)) {
        queue_request(RequestType::invalid_frame);
        return;
      }
      expected_frame_size_ =
          kFrameHeaderSize +
          binary::read_u16_le(header, kFramePayloadLengthOffset) +
          kFrameCrcSize;
    }
    if (expected_frame_size_ != 0 && frame_size_ == expected_frame_size_) {
      if (index + 1 < bytes.size()) {
        overrun_.store(true, std::memory_order_release);
      }
      queue_request(RequestType::frame);
      return;
    }
  }
}

void AssetControl::task_entry(void* const context) {
  static_cast<AssetControl*>(context)->process();
}

void AssetControl::process() {
  while (true) {
    const TickType_t wait = active() ? kInactivityTimeout : portMAX_DELAY;
    const std::uint32_t notified = ulTaskNotifyTake(pdTRUE, wait);
    if (notified == 0) {
      if (active()) {
        finish_with_error("timeout");
      }
      continue;
    }
    if (request_state_.load(std::memory_order_acquire) !=
        RequestState::ready) {
      if (active() && overrun_.exchange(false, std::memory_order_acq_rel)) {
        finish_with_error("protocol_overrun");
      }
      continue;
    }
    if (request_type_ == RequestType::begin) {
      handle_begin();
    } else if (request_type_ == RequestType::info) {
      handle_info();
    } else if (request_type_ == RequestType::clear) {
      handle_clear();
    } else if (request_type_ == RequestType::frame) {
      handle_frame();
    } else if (request_type_ == RequestType::invalid_command) {
      release_request();
      (void)send_error("unknown_command");
    } else if (request_type_ == RequestType::busy) {
      release_request();
      (void)send_error("busy");
    } else {
      finish_with_error("invalid_frame");
    }
  }
}

void AssetControl::handle_clear() {
  const char* const error = operations_.clear(operations_.service);
  release_request();
  if (error == nullptr) {
    (void)send_ok("CLEARED:reboot_required=1");
    return;
  }
  (void)send_error(error);
}

void AssetControl::handle_info() {
  int written =
      std::snprintf(response_.data(), response_.size(), "@SC:OK:%.*s:INFO:",
                    static_cast<int>(traits_.tag.size()), traits_.tag.data());
  release_request();
  if (written <= 0 || static_cast<std::size_t>(written) >= response_.size()) {
    return;
  }
  auto offset = static_cast<std::size_t>(written);
  // A body that does not fit suppresses the reply rather than sending a
  // truncated catalog the configurator would read as complete.
  written = operations_.write_info_body(
      operations_.service, response_.data() + offset, response_.size() - offset);
  if (written < 0) {
    return;
  }
  offset += static_cast<std::size_t>(written);
  if (offset + 1 < response_.size()) {
    response_[offset++] = '\n';
    response_[offset] = '\0';
    (void)send_text(response_.data());
  }
}

void AssetControl::handle_begin() {
  const char* const error =
      operations_.begin_update(operations_.service, requested_package_size_);
  if (error != nullptr) {
    finish_with_error(error, false);
    return;
  }
  package_size_ = requested_package_size_;
  received_size_ = 0;
  expected_sequence_ = 0;
  if (overrun_.exchange(false, std::memory_order_acq_rel)) {
    finish_with_error("protocol_overrun");
    return;
  }
  release_request();
  if (!send_ok("READY:max_chunk=1024")) {
    operations_.cancel_update(operations_.service);
    reset_session();
  }
}

void AssetControl::handle_frame() {
  const auto frame =
      std::span<const std::uint8_t>(frame_.data(), request_frame_size_);
  const std::size_t content_size = frame.size() - kFrameCrcSize;
  const std::uint32_t sequence =
      binary::read_u32_le(frame, kFrameSequenceOffset);
  const std::uint32_t supplied_crc = binary::read_u32_le(frame, content_size);
  if (supplied_crc != binary::crc32(frame.first(content_size))) {
    finish_with_error("frame_crc");
    return;
  }
  if (sequence != expected_sequence_) {
    finish_with_error("sequence");
    return;
  }

  const auto type = static_cast<FrameType>(frame[kFrameTypeOffset]);
  if (type == FrameType::cancel) {
    operations_.cancel_update(operations_.service);
    release_request();
    reset_session();
    (void)send_ok("CANCELLED");
    return;
  }
  if (type == FrameType::commit) {
    if (received_size_ != package_size_) {
      finish_with_error("incomplete_package");
      return;
    }
    if (const char* const error = operations_.commit_update(operations_.service);
        error != nullptr) {
      finish_with_error(error);
      return;
    }
    release_request();
    reset_session();
    (void)send_ok("COMMITTED:reboot_required=1");
    return;
  }

  const std::size_t payload_size =
      binary::read_u16_le(frame, kFramePayloadLengthOffset);
  if (payload_size > package_size_ - received_size_) {
    finish_with_error("invalid_size");
    return;
  }
  if (const char* const error = operations_.write_update(
          operations_.service, frame.subspan(kFrameHeaderSize, payload_size));
      error != nullptr) {
    finish_with_error(error);
    return;
  }
  received_size_ += payload_size;
  ++expected_sequence_;
  if (overrun_.exchange(false, std::memory_order_acq_rel)) {
    finish_with_error("protocol_overrun");
    return;
  }
  release_request();
  if (!send_ack(sequence)) {
    operations_.cancel_update(operations_.service);
    reset_session();
  }
}

void AssetControl::queue_request(const RequestType type) {
  RequestState expected = RequestState::idle;
  if (!request_state_.compare_exchange_strong(
          expected, RequestState::writing, std::memory_order_acquire,
          std::memory_order_relaxed)) {
    overrun_.store(true, std::memory_order_release);
    xTaskNotifyGive(task_);
    return;
  }
  request_frame_size_ = frame_size_;
  frame_size_ = 0;
  expected_frame_size_ = 0;
  request_type_ = type;
  request_state_.store(RequestState::ready, std::memory_order_release);
  xTaskNotifyGive(task_);
}

void AssetControl::release_request() {
  request_state_.store(RequestState::idle, std::memory_order_release);
}

void AssetControl::finish_with_error(const char* const error,
                                     const bool cancel_update) {
  if (cancel_update && operations_.service != nullptr) {
    operations_.cancel_update(operations_.service);
  }
  release_request();
  reset_session();
  (void)send_error(error);
}

bool AssetControl::send_text(const char* const text) {
  return transport_ != nullptr &&
         transport_->write(std::span<const std::uint8_t>(
             reinterpret_cast<const std::uint8_t*>(text), std::strlen(text)));
}

// Every reply names the kind in the same position, so the tag is written here
// and the caller supplies only what follows it.
bool AssetControl::send_ok(const char* const rest) {
  const int written =
      std::snprintf(response_.data(), response_.size(), "@SC:OK:%.*s:%s\n",
                    static_cast<int>(traits_.tag.size()), traits_.tag.data(),
                    rest);
  return written > 0 && static_cast<std::size_t>(written) < response_.size() &&
         send_text(response_.data());
}

bool AssetControl::send_error(const char* const word) {
  const int written =
      std::snprintf(response_.data(), response_.size(), "@SC:ERR:%.*s:%s\n",
                    static_cast<int>(traits_.tag.size()), traits_.tag.data(),
                    word);
  return written > 0 && static_cast<std::size_t>(written) < response_.size() &&
         send_text(response_.data());
}

bool AssetControl::send_ack(const std::uint32_t sequence) {
  const int written = std::snprintf(
      response_.data(), response_.size(),
      "@SC:OK:%.*s:ACK:sequence=%lu,received=%lu\n",
      static_cast<int>(traits_.tag.size()), traits_.tag.data(),
      static_cast<unsigned long>(sequence),
      static_cast<unsigned long>(received_size_));
  return written > 0 && static_cast<std::size_t>(written) < response_.size() &&
         send_text(response_.data());
}

void AssetControl::reset_session() {
  package_size_ = 0;
  received_size_ = 0;
  expected_sequence_ = 0;
  overrun_.store(false, std::memory_order_relaxed);
  session_active_.store(false, std::memory_order_release);
  // Releases only if this session still holds the stream, so an error arriving
  // after another kind took it cannot hand it away.
  if (claim_ != nullptr) {
    claim_->release(&session_);
  }
}

}  // namespace simcore::asset_control
