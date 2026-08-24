#include "configuration_control.hpp"

#include <algorithm>
#include <string_view>

#include "performance.hpp"
#include "simcore_features.hpp"
#include "transport.hpp"

// The lifecycle half of configuration control: the worker task and the
// single-request intake it drains. What each command means, and every reply,
// live in configuration_control_commands.cpp.
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
  // The group is created once over storage this object owns and then only ever
  // has its bit cleared, so a control service that is stopped and started again
  // waits on the same handle rather than leaking a new one each time.
  if (composed_ == nullptr) {
    composed_ = xEventGroupCreateStatic(&composed_storage_);
  }
  if (composed_ != nullptr) {
    (void)xEventGroupClearBits(composed_, kComposedBit);
  }
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

void ConfigurationControl::mark_composed() {
  if (composed_ != nullptr) {
    (void)xEventGroupSetBits(composed_, kComposedBit);
  }
}

bool ConfigurationControl::await_composition() {
  // No group means the service was never initialized, which the caller already
  // guards; answering "ready" keeps the failure where it belongs rather than
  // turning it into a timeout.
  if (composed_ == nullptr) {
    return true;
  }
  const EventBits_t bits =
      xEventGroupWaitBits(composed_, kComposedBit, pdFALSE, pdTRUE,
                          pdMS_TO_TICKS(kCompositionWaitMs));
  return (bits & kComposedBit) != 0;
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
  if (composed_ != nullptr) {
    (void)xEventGroupClearBits(composed_, kComposedBit);
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

}  // namespace simcore::configuration
