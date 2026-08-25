#include <cstdio>

#include "asset_control.hpp"
#include "binary_codec.hpp"
#include "crc32.hpp"
#include "scf1_frame.hpp"

// The worker half of the upload engine: the task that owns each queued request,
// the per-frame protocol checks, and the session teardown they share. The
// intake half — command matching and byte accumulation on the reading task —
// lives in asset_control.cpp.
namespace simcore::asset_control {

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
    // Taken while the request is still held, so every reply below — including
    // the ones sent after the state is released — goes to the link that asked.
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
  // The host matches this line literally.
  static_assert(kUploadMaximumChunkSize == 4096);
  if (!send_ok("READY:max_chunk=4096")) {
    operations_.cancel_update(operations_.service);
    reset_session();
  }
}

void AssetControl::handle_frame() {
  const auto frame =
      std::span<const std::uint8_t>(frame_.data(), request_frame_size_);
  const std::size_t content_size = frame.size() - kFrameCrcSize;
  const std::uint32_t sequence =
      binary::read_u32_le(frame, scf1::kSequenceOffset);
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

  const std::size_t payload_size =
      binary::read_u16_le(frame, scf1::kPayloadLengthOffset);
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
