#include "asset_control.hpp"

#include <algorithm>
#include <charconv>
#include <cstdio>
#include <cstring>

#include "binary_codec.hpp"
#include "scf1_frame.hpp"
#include "simcore_features.hpp"

namespace simcore::asset_control {
namespace {

[[nodiscard]] bool matches(const std::span<const std::uint8_t> line,
                           const std::string_view command) {
  return line.size() == command.size() &&
         std::equal(command.begin(), command.end(), line.begin());
}

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

}

AssetControl::~AssetControl() { stop(); }

void AssetControl::consume_command_entry(
    void* const context, const std::span<const std::uint8_t> line,
    transport::ITransport& reply) {
  static_cast<AssetControl*>(context)->consume_command(line, reply);
}

void AssetControl::consume_entry(void* const context,
                                 const std::span<const std::uint8_t> bytes) {
  static_cast<AssetControl*>(context)->consume(bytes);
}

bool AssetControl::initialize(const Traits& traits,
                              const Operations& operations,
                              binary_session::Claim& claim,
                              const std::span<std::uint8_t> frame) {
  if (task_ != nullptr || frame.size() < kMaximumFrameSize) {
    return false;
  }
  traits_ = traits;
  operations_ = operations;
  claim_ = &claim;
  frame_ = frame.first(kMaximumFrameSize);
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
  task_ = xTaskCreateStaticPinnedToCore(
      &AssetControl::task_entry, traits_.task_name, task_stack_.size(), this,
      kTaskPriority, task_stack_.data(), &task_state_,
      SIMCORE_COMMUNICATION_CORE);
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
  requested_reply_ = nullptr;
  reply_ = nullptr;
  frame_ = {};
}

bool AssetControl::ready() const {
  return operations_.service != nullptr && task_ != nullptr;
}

void AssetControl::consume_command(const std::span<const std::uint8_t> line,
                                   transport::ITransport& reply) {
  if (!ready()) {
    return;
  }
  if (active()) {
    send_busy(reply);
    return;
  }

  RequestState expected = RequestState::idle;
  if (!request_state_.compare_exchange_strong(
          expected, RequestState::writing, std::memory_order_acquire,
          std::memory_order_relaxed)) {
    return;
  }

  requested_reply_ = &reply;
  const std::string_view begin_prefix{
      begin_command_.data(), std::strlen(begin_command_.data())};
  requested_package_size_ = 0;
  if (matches(line, {info_command_.data(), std::strlen(info_command_.data())})) {
    request_type_ = RequestType::info;
  } else if (matches(line, {clear_command_.data(),
                            std::strlen(clear_command_.data())})) {
    request_type_ = claim_ != nullptr && !claim_->ready() ? RequestType::busy
                                                         : RequestType::clear;
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
    if (claim_ != nullptr && !claim_->try_claim(&session_, &reply)) {
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
      if (!scf1::valid_header(header)) {
        queue_request(RequestType::invalid_frame);
        return;
      }
      expected_frame_size_ =
          kFrameHeaderSize +
          binary::read_u16_le(header, scf1::kPayloadLengthOffset) +
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


bool report_progress(const AssetControl& control, std::uint8_t& percent) {
  if (!control.active()) {
    return false;
  }
  const AssetControl::Progress progress = control.progress();
  percent = progress.total == 0
                ? 0
                : static_cast<std::uint8_t>(
                      std::min<std::size_t>(progress.received * 100 /
                                                progress.total,
                                            100));
  return true;
}

}
