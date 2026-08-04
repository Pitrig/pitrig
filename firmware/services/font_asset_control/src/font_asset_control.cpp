#include "font_asset_control.hpp"

#include <algorithm>
#include <charconv>
#include <cstdio>
#include <cstring>
#include <string_view>

#include "font_asset_crc.hpp"

namespace simcore::font_assets {
namespace {

constexpr std::string_view kBeginPrefix = "@SC:FONT:BEGIN:size=";
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

[[nodiscard]] std::uint16_t get_u16(
    const std::span<const std::uint8_t> bytes, const std::size_t offset) {
  return static_cast<std::uint16_t>(bytes[offset]) |
         static_cast<std::uint16_t>(bytes[offset + 1]) << 8U;
}

[[nodiscard]] std::uint32_t get_u32(
    const std::span<const std::uint8_t> bytes, const std::size_t offset) {
  std::uint32_t value{};
  for (std::size_t index = 0; index < 4; ++index) {
    value |= static_cast<std::uint32_t>(bytes[offset + index])
             << (index * 8U);
  }
  return value;
}

[[nodiscard]] bool valid_header(
    const std::span<const std::uint8_t> header) {
  if (header.size() != 14 ||
      !std::equal(kFrameMagic.begin(), kFrameMagic.end(), header.begin()) ||
      header[kFrameReservedByteOffset] != 0 ||
      get_u16(header, kFrameReservedWordOffset) != 0) {
    return false;
  }
  const auto type = static_cast<FrameType>(header[kFrameTypeOffset]);
  const std::size_t payload_size =
      get_u16(header, kFramePayloadLengthOffset);
  if (type == FrameType::data) {
    return payload_size > 0 && payload_size <= kUploadMaximumChunkSize;
  }
  return (type == FrameType::commit || type == FrameType::cancel) &&
         payload_size == 0;
}

}  // namespace

bool FontAssetControl::initialize(Service& service,
                                  transport::ITransport& transport) {
  if (task_ != nullptr) {
    return false;
  }
  service_ = &service;
  transport_ = &transport;
  reset_session();
  request_state_.store(RequestState::idle, std::memory_order_relaxed);
  task_ = xTaskCreateStatic(&FontAssetControl::task_entry,
                            "font_asset_control", task_stack_.size(), this,
                            kTaskPriority, task_stack_.data(), &task_state_);
  return task_ != nullptr;
}

void FontAssetControl::begin(const std::span<const std::uint8_t> line) {
  if (service_ == nullptr || transport_ == nullptr || task_ == nullptr ||
      active()) {
    return;
  }

  RequestState expected = RequestState::idle;
  if (!request_state_.compare_exchange_strong(
          expected, RequestState::writing, std::memory_order_acquire,
          std::memory_order_relaxed)) {
    return;
  }

  requested_package_size_ = 0;
  if (line.size() >= kBeginPrefix.size() &&
      std::equal(kBeginPrefix.begin(), kBeginPrefix.end(), line.begin())) {
    const auto value = line.subspan(kBeginPrefix.size());
    const auto* const begin = reinterpret_cast<const char*>(value.data());
    const auto* const end = begin + value.size();
    const auto result =
        std::from_chars(begin, end, requested_package_size_, 10);
    if (result.ec != std::errc{} || result.ptr != end) {
      requested_package_size_ = 0;
    }
  }

  frame_size_ = 0;
  expected_frame_size_ = 0;
  overrun_.store(false, std::memory_order_relaxed);
  session_active_.store(true, std::memory_order_release);
  request_type_ = RequestType::begin;
  request_state_.store(RequestState::ready, std::memory_order_release);
  xTaskNotifyGive(task_);
}

void FontAssetControl::consume(const std::span<const std::uint8_t> bytes) {
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
      const auto header = std::span<const std::uint8_t>(
          frame_.data(), kFrameHeaderSize);
      if (!valid_header(header)) {
        queue_request(RequestType::invalid_frame);
        return;
      }
      expected_frame_size_ = kFrameHeaderSize +
                             get_u16(header, kFramePayloadLengthOffset) +
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

void FontAssetControl::task_entry(void* const context) {
  static_cast<FontAssetControl*>(context)->process();
}

void FontAssetControl::process() {
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
    } else if (request_type_ == RequestType::frame) {
      handle_frame();
    } else {
      finish_with_error("invalid_frame");
    }
  }
}

void FontAssetControl::handle_begin() {
  const UpdateError error = service_->begin_update(requested_package_size_);
  if (error != UpdateError::none) {
    finish_with_error(update_error_name(error), false);
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
  if (!send_text("@SC:OK:FONT:READY:max_chunk=1024\n")) {
    service_->cancel_update();
    reset_session();
  }
}

void FontAssetControl::handle_frame() {
  const auto frame =
      std::span<const std::uint8_t>(frame_.data(), request_frame_size_);
  const std::size_t content_size = frame.size() - kFrameCrcSize;
  const std::uint32_t sequence = get_u32(frame, kFrameSequenceOffset);
  const std::uint32_t supplied_crc = get_u32(frame, content_size);
  if (supplied_crc != crc32(frame.first(content_size))) {
    finish_with_error("frame_crc");
    return;
  }
  if (sequence != expected_sequence_) {
    finish_with_error("sequence");
    return;
  }

  const auto type = static_cast<FrameType>(frame[kFrameTypeOffset]);
  if (type == FrameType::cancel) {
    service_->cancel_update();
    release_request();
    reset_session();
    (void)send_text("@SC:OK:FONT:CANCELLED\n");
    return;
  }
  if (type == FrameType::commit) {
    if (received_size_ != package_size_) {
      finish_with_error("incomplete_package");
      return;
    }
    const UpdateError error = service_->commit_update();
    if (error != UpdateError::none) {
      finish_with_error(update_error_name(error));
      return;
    }
    release_request();
    reset_session();
    (void)send_text("@SC:OK:FONT:COMMITTED:reboot_required=1\n");
    return;
  }

  const std::size_t payload_size =
      get_u16(frame, kFramePayloadLengthOffset);
  if (payload_size > package_size_ - received_size_) {
    finish_with_error("invalid_size");
    return;
  }
  const UpdateError error = service_->write_update(
      frame.subspan(kFrameHeaderSize, payload_size));
  if (error != UpdateError::none) {
    finish_with_error(update_error_name(error));
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
    service_->cancel_update();
    reset_session();
  }
}

void FontAssetControl::queue_request(const RequestType type) {
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

void FontAssetControl::release_request() {
  request_state_.store(RequestState::idle, std::memory_order_release);
}

void FontAssetControl::finish_with_error(const char* const error,
                                         const bool cancel_update) {
  if (cancel_update) {
    service_->cancel_update();
  }
  release_request();
  reset_session();
  const int written = std::snprintf(response_.data(), response_.size(),
                                    "@SC:ERR:FONT:%s\n", error);
  if (written > 0 && static_cast<std::size_t>(written) < response_.size()) {
    (void)send_text(response_.data());
  }
}

bool FontAssetControl::send_text(const char* const text) {
  return transport_ != nullptr &&
         transport_->write(std::span<const std::uint8_t>(
             reinterpret_cast<const std::uint8_t*>(text),
             std::strlen(text)));
}

bool FontAssetControl::send_ack(const std::uint32_t sequence) {
  const int written = std::snprintf(
      response_.data(), response_.size(),
      "@SC:OK:FONT:ACK:sequence=%lu,received=%lu\n",
      static_cast<unsigned long>(sequence),
      static_cast<unsigned long>(received_size_));
  return written > 0 && static_cast<std::size_t>(written) < response_.size() &&
         send_text(response_.data());
}

void FontAssetControl::reset_session() {
  package_size_ = 0;
  received_size_ = 0;
  expected_sequence_ = 0;
  overrun_.store(false, std::memory_order_relaxed);
  session_active_.store(false, std::memory_order_release);
}

}  // namespace simcore::font_assets
