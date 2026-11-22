#include <cstdio>

#include "asset_control.hpp"
#include "binary_codec.hpp"
#include "control_protocol_generated.hpp"
#include "crc32.hpp"
#include "scf1_frame.hpp"

namespace pitrig::asset_control {

void AssetControl::serve() {
  if (request_state_.load(std::memory_order_acquire) == RequestState::ready) {
    handle_request();
    last_activity_.store(xTaskGetTickCount(), std::memory_order_release);
    return;
  }
  if (!active()) {
    return;
  }
  if (overrun_.exchange(false, std::memory_order_acq_rel)) {
    finish_with_error("protocol_overrun");
    return;
  }
  if (wait_ticks() == 0) {
    finish_with_error("timeout");
  }
}

TickType_t AssetControl::wait_ticks() const {
  if (!active()) {
    return portMAX_DELAY;
  }
  const TickType_t last = last_activity_.load(std::memory_order_acquire);
  const TickType_t elapsed = xTaskGetTickCount() - last;
  return elapsed >= kInactivityTimeout ? 0 : kInactivityTimeout - elapsed;
}

void AssetControl::handle_request() {
  reply_ = requested_reply_;
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
    if (reply_ != nullptr) {
      send_busy(*reply_, busy_tag_);
    }
  } else {
    finish_with_error("invalid_frame");
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
  const std::span<char> response = worker_->reply_buffer();
  int written =
      std::snprintf(response.data(), response.size(), PITRIG_CONTROL_PREFIX "OK:%.*s:INFO:",
                    static_cast<int>(traits_.tag.size()), traits_.tag.data());
  release_request();
  if (written > 0 && static_cast<std::size_t>(written) < response.size()) {
    auto offset = static_cast<std::size_t>(written);
    written = operations_.write_info_body(operations_.service, response.data() + offset,
                                          response.size() - offset);
    if (written >= 0) {
      offset += static_cast<std::size_t>(written);
      if (offset + 1 < response.size()) {
        response[offset++] = '\n';
        response[offset] = '\0';
        (void)send_text(response.data());
        return;
      }
    }
  }
  (void)send_error("response_size");
}

void AssetControl::handle_begin() {
  const char* const error = operations_.begin_update(operations_.service, requested_package_size_);
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
  static_assert(kUploadMaximumChunkSize == 4096);
  if (!send_ok("READY:max_chunk=4096")) {
    operations_.cancel_update(operations_.service);
    reset_session();
  }
}

void AssetControl::handle_frame() {
  const auto frame = std::span<const std::uint8_t>(frame_.data(), request_frame_size_);
  const std::size_t content_size = frame.size() - kFrameCrcSize;
  const std::uint32_t sequence = binary::read_u32_le(frame, scf1::kSequenceOffset);
  const std::uint32_t supplied_crc = binary::read_u32_le(frame, content_size);
  if (supplied_crc != binary::crc32(frame.first(content_size))) {
    finish_with_error("frame_crc");
    return;
  }
  if (sequence != expected_sequence_) {
    finish_with_error("sequence");
    return;
  }

  const auto type = static_cast<scf1::FrameType>(frame[scf1::kTypeOffset]);
  if (type == scf1::FrameType::cancel) {
    operations_.cancel_update(operations_.service);
    release_request();
    reset_session();
    (void)send_ok("CANCELLED");
    return;
  }
  if (type == scf1::FrameType::commit) {
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

  const std::size_t payload_size = binary::read_u16_le(frame, scf1::kPayloadLengthOffset);
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
          expected, RequestState::writing, std::memory_order_acquire, std::memory_order_relaxed)) {
    overrun_.store(true, std::memory_order_release);
    wake();
    return;
  }
  request_frame_size_ = frame_size_;
  frame_size_ = 0;
  expected_frame_size_ = 0;
  request_type_ = type;
  request_state_.store(RequestState::ready, std::memory_order_release);
  wake();
}

void AssetControl::release_request() {
  request_state_.store(RequestState::idle, std::memory_order_release);
}

void AssetControl::finish_with_error(const char* const error, const bool cancel_update) {
  if (cancel_update && operations_.service != nullptr) {
    operations_.cancel_update(operations_.service);
  }
  release_request();
  reset_session();
  (void)send_error(error);
}

void AssetControl::reset_session() {
  package_size_ = 0;
  received_size_ = 0;
  expected_sequence_ = 0;
  overrun_.store(false, std::memory_order_relaxed);
  if (claim_ != nullptr) {
    claim_->release(&session_);
  }
  session_active_.store(false, std::memory_order_release);
}

}
