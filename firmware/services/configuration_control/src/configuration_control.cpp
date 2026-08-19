#include "configuration_control.hpp"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <string_view>

#include "esp_app_desc.h"
#include "performance.hpp"
#include "simcore_features.hpp"
#include "transport.hpp"

namespace simcore::configuration {
namespace {

constexpr std::string_view kPrefix = "@SC:";

}  // namespace

ConfigurationControl::~ConfigurationControl() { stop(); }

bool ConfigurationControl::initialize(
    ConfigurationService& service, const RebootHandler reboot_handler,
    void* const reboot_context, const ApplyHandler apply_handler,
    void* const apply_context, const std::span<std::uint8_t> io_buffer) {
  if (task_ != nullptr || io_buffer.size() < kIoBufferSize) {
    return false;
  }
  io_buffer_ = io_buffer.first(kIoBufferSize);
  service_ = &service;
  reboot_handler_ = reboot_handler;
  reboot_context_ = reboot_context;
  apply_handler_ = apply_handler;
  apply_context_ = apply_context;
  request_state_.store(RequestState::idle, std::memory_order_relaxed);
  // Parsing and validating a 64 KB document, and a live apply, run here; on
  // the communication core they never time-slice with the LVGL task.
  task_ = xTaskCreateStaticPinnedToCore(
      &ConfigurationControl::task_entry, "configuration_control",
      task_stack_.size(), this, kTaskPriority, task_stack_.data(),
      &task_state_, SIMCORE_COMMUNICATION_CORE);
  if (task_ != nullptr) {
#if SIMCORE_DEBUG
    performance::register_task(performance::TaskMetric::configuration_control,
                               task_);
#endif
  } else {
    stop();
  }
  return task_ != nullptr;
}

void ConfigurationControl::stop() {
  if (task_ != nullptr) {
#if SIMCORE_DEBUG
    performance::unregister_task(
        performance::TaskMetric::configuration_control);
#endif
    vTaskDelete(task_);
    task_ = nullptr;
  }
  request_state_.store(RequestState::idle, std::memory_order_release);
  request_size_ = 0;
  service_ = nullptr;
  reply_ = nullptr;
  reboot_handler_ = nullptr;
  reboot_context_ = nullptr;
  apply_handler_ = nullptr;
  apply_context_ = nullptr;
  io_buffer_ = {};
}

void ConfigurationControl::consume(
    const std::span<const std::uint8_t> line, transport::ITransport& reply) {
  if (service_ == nullptr || task_ == nullptr ||
      line.size() > io_buffer_.size() ||
      line.size() < kPrefix.size() ||
      !std::equal(kPrefix.begin(), kPrefix.end(), line.begin())) {
    return;
  }
  RequestState expected = RequestState::idle;
  if (!request_state_.compare_exchange_strong(
          expected, RequestState::writing, std::memory_order_acquire,
          std::memory_order_relaxed)) {
    return;
  }
  std::copy(line.begin(), line.end(), io_buffer_.begin());
  request_size_ = line.size();
  reply_ = &reply;
  request_state_.store(RequestState::ready, std::memory_order_release);
  xTaskNotifyGive(task_);
}

void ConfigurationControl::task_entry(void* const context) {
  static_cast<ConfigurationControl*>(context)->process();
}

void ConfigurationControl::process() {
  while (true) {
    (void)ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    if (request_state_.load(std::memory_order_acquire) !=
        RequestState::ready) {
      continue;
    }
    handle(std::span<const std::uint8_t>(io_buffer_.data(), request_size_));
    request_state_.store(RequestState::idle, std::memory_order_release);
  }
}

void ConfigurationControl::handle(
    const std::span<const std::uint8_t> line) {
  const std::span<const std::uint8_t> command =
      line.subspan(kPrefix.size());

  if (command.size() == 4 &&
      std::equal(command.begin(), command.end(), "INFO")) {
    const ConfigurationStatus status = service_->status();
    const std::string_view board = board_id_name(service_->hardware_board());
    const char* source = "factory";
    if (status.source == ConfigurationSource::slot_a) {
      source = "slot_a";
    } else if (status.source == ConfigurationSource::slot_b) {
      source = "slot_b";
    }
    const int written = std::snprintf(
        reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size(),
        "@SC:OK:INFO:board=%.*s,firmware=%s,schema=%u,source=%s,generation=%lu,storage=%u\n",
        static_cast<int>(board.size()), board.data(),
        esp_app_get_description()->version,
        static_cast<unsigned>(kConfigurationSchemaVersion), source,
        static_cast<unsigned long>(status.generation),
        status.storage_available ? 1U : 0U);
    if (written > 0 && static_cast<std::size_t>(written) < io_buffer_.size()) {
      (void)write_reply(
          std::span<const std::uint8_t>(io_buffer_.data(), written));
    }
    return;
  }

  if (command.size() == 3 &&
      std::equal(command.begin(), command.end(), "GET")) {
    (void)send_payload(service_->current_payload());
    return;
  }

  constexpr std::string_view kApply = "APPLY:";
  if (command.size() >= kApply.size() &&
      std::equal(kApply.begin(), kApply.end(), command.begin())) {
    if (apply_handler_ == nullptr) {
      (void)send_text("@SC:ERR:unsupported\n");
      return;
    }
    const ValidationFailure failure =
        apply_handler_(command.subspan(kApply.size()), apply_context_);
    if (!failure.ok()) {
      (void)send_error(failure);
      return;
    }
    (void)send_text("@SC:OK:APPLIED\n");
    return;
  }

  constexpr std::string_view kValidate = "VALIDATE:";
  constexpr std::string_view kSet = "SET:";
  const bool validate =
      command.size() >= kValidate.size() &&
      std::equal(kValidate.begin(), kValidate.end(), command.begin());
  const bool set =
      command.size() >= kSet.size() &&
      std::equal(kSet.begin(), kSet.end(), command.begin());
  if (validate || set) {
    const std::size_t prefix_size =
        validate ? kValidate.size() : kSet.size();
    const std::span<const std::uint8_t> payload =
        command.subspan(prefix_size);
    if (validate) {
      const ValidationFailure failure = service_->validate_payload(payload);
      if (!failure.ok()) {
        (void)send_error(failure);
        return;
      }
      (void)send_text("@SC:OK:VALID\n");
      return;
    }
    const ConfigurationService::SaveOutcome outcome = service_->save(payload);
    if (outcome.storage_failed) {
      // The same answer RESET gives when flash refuses it, rather than a
      // validation error over a document that parsed and validated fine.
      (void)send_text("@SC:ERR:storage\n");
      return;
    }
    if (!outcome.failure.ok()) {
      (void)send_error(outcome.failure);
      return;
    }
    (void)send_text("@SC:OK:SAVED:reboot_required=1\n");
    return;
  }

  if (command.size() == 5 &&
      std::equal(command.begin(), command.end(), "RESET")) {
    if (service_->reset()) {
      (void)send_text("@SC:OK:RESET:reboot_required=1\n");
    } else {
      (void)send_text("@SC:ERR:storage\n");
    }
    return;
  }

  if (command.size() == 6 &&
      std::equal(command.begin(), command.end(), "REBOOT")) {
    (void)send_text("@SC:OK:REBOOTING\n");
    if (reboot_handler_ != nullptr) {
      reboot_handler_(reboot_context_);
    }
    return;
  }

  (void)send_text("@SC:ERR:unknown_command\n");
}

bool ConfigurationControl::write_reply(
    const std::span<const std::uint8_t> data) {
  transport::ITransport* const link = reply();
  return link != nullptr && link->write(data);
}

bool ConfigurationControl::send_text(const char* const text) {
  return write_reply(std::span<const std::uint8_t>(
      reinterpret_cast<const std::uint8_t*>(text), std::strlen(text)));
}

bool ConfigurationControl::send_error(const ValidationFailure& failure) {
  // The reason token keeps its position so existing hosts still parse it.
  // Location details follow only when the failure has them.
  const std::string_view reason = validation_error_name(failure.error);
  const std::string_view path = text_view(failure.path);
  const int written = std::snprintf(
      reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size(),
      "@SC:ERR:%.*s:screen=%d,widget=%d,path=%.*s\n",
      static_cast<int>(reason.size()), reason.data(),
      static_cast<int>(failure.screen_index),
      static_cast<int>(failure.widget_index),
      static_cast<int>(path.size()), path.data());
  return written > 0 &&
         static_cast<std::size_t>(written) < io_buffer_.size() &&
         write_reply(
             std::span<const std::uint8_t>(io_buffer_.data(), written));
}

bool ConfigurationControl::send_payload(
    const std::span<const std::uint8_t> payload) {
  constexpr char prefix[] = "@SC:OK:CONFIG:";
  constexpr std::size_t prefix_size = sizeof(prefix) - 1;
  if (prefix_size + payload.size() + 1U > io_buffer_.size()) {
    // The contract defines malformed as covering an oversized payload, so this
    // is the documented answer rather than an approximation of one.
    return send_error({.error = ValidationError::malformed});
  }
  std::copy_n(reinterpret_cast<const std::uint8_t*>(prefix), prefix_size,
              io_buffer_.begin());
  std::size_t position = prefix_size;
  std::copy(payload.begin(), payload.end(), io_buffer_.begin() + position);
  position += payload.size();
  io_buffer_[position++] = '\n';
  return write_reply(
      std::span<const std::uint8_t>(io_buffer_.data(), position));
}

}  // namespace simcore::configuration
