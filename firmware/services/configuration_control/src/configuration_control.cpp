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
    ConfigurationService& service, transport::ITransport& transport,
    const RebootHandler reboot_handler, void* const reboot_context) {
  if (task_ != nullptr) {
    return false;
  }
  service_ = &service;
  transport_ = &transport;
  reboot_handler_ = reboot_handler;
  reboot_context_ = reboot_context;
  request_state_.store(RequestState::idle, std::memory_order_relaxed);
  task_ = xTaskCreateStatic(&ConfigurationControl::task_entry,
                            "configuration_control", task_stack_.size(), this,
                            kTaskPriority, task_stack_.data(), &task_state_);
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
  transport_ = nullptr;
  reboot_handler_ = nullptr;
  reboot_context_ = nullptr;
}

void ConfigurationControl::consume(
    const std::span<const std::uint8_t> line) {
  if (service_ == nullptr || transport_ == nullptr ||
      task_ == nullptr || line.size() > io_buffer_.size() ||
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
    const char* const board = board_id_name(service_->hardware_board());
    const char* source = "factory";
    if (status.source == ConfigurationSource::slot_a) {
      source = "slot_a";
    } else if (status.source == ConfigurationSource::slot_b) {
      source = "slot_b";
    }
    const int written = std::snprintf(
        reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size(),
        "@SC:OK:INFO:board=%s,firmware=%s,schema=%u,source=%s,generation=%lu,storage=%u\n",
        board, esp_app_get_description()->version,
        static_cast<unsigned>(kConfigurationSchemaVersion), source,
        static_cast<unsigned long>(status.generation),
        status.storage_available ? 1U : 0U);
    if (written > 0 && static_cast<std::size_t>(written) < io_buffer_.size()) {
      transport_->write(
          std::span<const std::uint8_t>(io_buffer_.data(), written));
    }
    return;
  }

  if (command.size() == 3 &&
      std::equal(command.begin(), command.end(), "GET")) {
    send_payload(service_->current_payload());
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
    const ValidationError error =
        validate ? service_->validate_payload(payload)
                 : service_->save(payload);
    if (error != ValidationError::none) {
      send_error(error);
      return;
    }
    send_text(validate ? "@SC:OK:VALID\n"
                       : "@SC:OK:SAVED:reboot_required=1\n");
    return;
  }

  if (command.size() == 5 &&
      std::equal(command.begin(), command.end(), "RESET")) {
    if (service_->reset()) {
      send_text("@SC:OK:RESET:reboot_required=1\n");
    } else {
      send_text("@SC:ERR:storage\n");
    }
    return;
  }

  if (command.size() == 6 &&
      std::equal(command.begin(), command.end(), "REBOOT")) {
    send_text("@SC:OK:REBOOTING\n");
    if (reboot_handler_ != nullptr) {
      reboot_handler_(reboot_context_);
    }
    return;
  }

  send_text("@SC:ERR:unknown_command\n");
}

void ConfigurationControl::send_text(const char* const text) {
  transport_->write(std::span<const std::uint8_t>(
      reinterpret_cast<const std::uint8_t*>(text), std::strlen(text)));
}

void ConfigurationControl::send_error(const ValidationError error) {
  const int written = std::snprintf(
      reinterpret_cast<char*>(io_buffer_.data()), io_buffer_.size(),
      "@SC:ERR:%s\n", validation_error_name(error));
  if (written > 0 && static_cast<std::size_t>(written) < io_buffer_.size()) {
    transport_->write(
        std::span<const std::uint8_t>(io_buffer_.data(), written));
  }
}

void ConfigurationControl::send_payload(
    const std::span<const std::uint8_t> payload) {
  constexpr char prefix[] = "@SC:OK:CONFIG:";
  constexpr std::size_t prefix_size = sizeof(prefix) - 1;
  if (prefix_size + payload.size() + 1U > io_buffer_.size()) {
    send_error(ValidationError::malformed);
    return;
  }
  std::copy_n(reinterpret_cast<const std::uint8_t*>(prefix), prefix_size,
              io_buffer_.begin());
  std::size_t position = prefix_size;
  std::copy(payload.begin(), payload.end(), io_buffer_.begin() + position);
  position += payload.size();
  io_buffer_[position++] = '\n';
  transport_->write(
      std::span<const std::uint8_t>(io_buffer_.data(), position));
}

}  // namespace simcore::configuration
