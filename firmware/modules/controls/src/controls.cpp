#include "controls.hpp"

#include <new>

#include "control_plan.hpp"
#include "control_state.hpp"
#include "esp_heap_caps.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "logger.hpp"
#include "pitrig_features.hpp"

namespace pitrig::controls {
namespace {

constexpr std::uint32_t kTickMs = 10;
constexpr std::uint32_t kTaskStackBytes = 3072;
constexpr UBaseType_t kTaskPriority = 3;
constexpr std::size_t kStopWaitTicks = 200;
constexpr std::uint32_t kStopPollMs = 5;

template <typename Type>
[[nodiscard]] Type* allocate() {
  void* memory = heap_caps_calloc(1, sizeof(Type), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (memory == nullptr) {
    memory = heap_caps_calloc(1, sizeof(Type), MALLOC_CAP_8BIT);
  }
  return memory == nullptr ? nullptr : new (memory) Type{};
}

[[nodiscard]] std::uint64_t now() { return static_cast<std::uint64_t>(esp_timer_get_time()); }

}

bool used(const configuration::ApplicationConfiguration& configuration) {
  return controls_used(configuration.dashboard);
}

Controls::~Controls() { stop(); }

bool Controls::start(events::EventBus& event_bus, const telemetry::ITelemetryRegistry& registry,
                     const telemetry::ITelemetryReader& reader,
                     configuration::ConfigurationService& settings,
                     DashboardTarget* const dashboard,
                     const configuration::ApplicationConfiguration& configuration) {
  if (running_.load()) {
    return true;
  }
  if (task_ != nullptr) {
    if (!finished_.load()) {
      log::error(kTag, "Previous control task has not finished yet");
      return false;
    }
    task_ = nullptr;
  }
  release_memory();
  plan_ = allocate<Plan>();
  state_ = allocate<State>();
  if (plan_ == nullptr || state_ == nullptr) {
    log::error(kTag, "No memory for the button controls");
    release_memory();
    return false;
  }
  build_plan(configuration.dashboard, registry, *plan_);
  event_bus_ = &event_bus;
  reader_ = &reader;
  settings_ = &settings;
  dashboard_ = dashboard;
  state_->activity_us = now();
  state_->display_percent = settings.settings().display_brightness;

  running_.store(true);
  finished_.store(false);
  TaskHandle_t task = nullptr;
  if (xTaskCreatePinnedToCore(&Controls::task_entry, "controls", kTaskStackBytes, this,
                              kTaskPriority, &task, PITRIG_COMMUNICATION_CORE) != pdPASS) {
    task = nullptr;
  }
  task_ = task;
  if (task_ == nullptr) {
    log::error(kTag, "Control task did not start");
    running_.store(false);
    finished_.store(true);
    release_memory();
    return false;
  }
  return true;
}

void Controls::stop() {
  running_.store(false);
  if (task_ != nullptr) {
    for (std::size_t wait = 0; wait < kStopWaitTicks && !finished_.load(); ++wait) {
      vTaskDelay(pdMS_TO_TICKS(kStopPollMs));
    }
    if (!finished_.load()) {
      log::error(kTag, "Control task did not finish");
      return;
    }
    task_ = nullptr;
  }
  release_memory();
}

void Controls::release_memory() {
  heap_caps_free(plan_);
  heap_caps_free(state_);
  plan_ = nullptr;
  state_ = nullptr;
}

void Controls::task_entry(void* const context) { static_cast<Controls*>(context)->run(); }

void Controls::run() {
  (void)esp_task_wdt_add(nullptr);
  const TickType_t period = pdMS_TO_TICKS(kTickMs);
  TickType_t wake = xTaskGetTickCount();
  while (running_.load()) {
    tick(now());
    (void)esp_task_wdt_reset();
    if (xTaskDelayUntil(&wake, period) == pdFALSE) {
      vTaskDelay(1);
      wake = xTaskGetTickCount();
    }
  }
  store_brightness(now(), true);
  (void)esp_task_wdt_delete(nullptr);
  finished_.store(true);
  vTaskDelete(nullptr);
}

void Controls::tick(const std::uint64_t now_us) {
  follow_buttons(now_us);
  follow_switch();
  follow_rules();
  return_home(now_us);
  follow_session();
  store_brightness(now_us, false);
}

std::uint32_t Controls::read_unsigned(const telemetry::Handle handle) const {
  if (!handle.valid()) {
    return 0;
  }
  const telemetry::TelemetryRead read = reader_->read(handle);
  return read.available && read.handle.type == telemetry::ValueType::uint32
             ? read.value.typed.uint32_value
             : 0;
}

std::uint8_t Controls::active_screen() const {
  return dashboard_ == nullptr ? 0 : dashboard_->active_screen();
}

void Controls::post(const DashboardCommand& command) {
  if (dashboard_ != nullptr && !dashboard_->post(command)) {
    log::warn(kTag, "Dashboard command dropped");
  }
}

void Controls::show_screen(const std::uint8_t screen) {
  if (screen != kNone) {
    post({.kind = CommandKind::show_screen, .screen = screen});
  }
}

}
