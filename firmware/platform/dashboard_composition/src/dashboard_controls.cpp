#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>

#include "dashboard_composition.hpp"
#include "dashboard_state.hpp"
#include "dashboard_target.hpp"
#include "display.hpp"
#include "esp_lvgl_port.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "logger.hpp"
#include "lvgl.h"

namespace pitrig::dashboard_composition {
namespace {

constexpr char kTag[] = "dashboard";
constexpr std::size_t kQueueLength = 16;
constexpr std::uint32_t kDrainPeriodMs = 10;

class ControlTarget final : public controls::DashboardTarget {
 public:
  [[nodiscard]] bool start();

  bool post(const controls::DashboardCommand& command) override {
    return queue_ != nullptr && xQueueSend(queue_, &command, 0) == pdTRUE;
  }

  [[nodiscard]] std::uint8_t active_screen() const override { return active_.load(); }

  void set_backlight(const std::uint8_t percent) override {
    (void)display::set_backlight(percent);
  }

 private:
  static void drain(lv_timer_t* timer);
  static void apply(const controls::DashboardCommand& command);

  StaticQueue_t queue_storage_{};
  std::array<std::uint8_t, kQueueLength * sizeof(controls::DashboardCommand)> queue_buffer_{};
  QueueHandle_t queue_{};
  lv_timer_t* timer_{};
  std::atomic<std::uint8_t> active_{};
};

ControlTarget g_control_target;

bool ControlTarget::start() {
  if (timer_ != nullptr) {
    return true;
  }
  if (queue_ == nullptr) {
    queue_ = xQueueCreateStatic(kQueueLength, sizeof(controls::DashboardCommand),
                                queue_buffer_.data(), &queue_storage_);
  }
  if (queue_ == nullptr || !lvgl_port_lock(0)) {
    return false;
  }
  timer_ = lv_timer_create(drain, kDrainPeriodMs, this);
  lvgl_port_unlock();
  return timer_ != nullptr;
}

void ControlTarget::drain(lv_timer_t* const timer) {
  auto* const target = static_cast<ControlTarget*>(lv_timer_get_user_data(timer));
  if (target == nullptr) {
    return;
  }
  controls::DashboardCommand command{};
  while (xQueueReceive(target->queue_, &command, 0) == pdTRUE) {
    apply(command);
  }
  target->active_.store(static_cast<std::uint8_t>(instance().navigation.active()));
}

void ControlTarget::apply(const controls::DashboardCommand& command) {
  Dashboard& dashboard = instance();
  switch (command.kind) {
    case controls::CommandKind::step_screen:
      dashboard.navigation.step(command.delta, command.wrap);
      break;
    case controls::CommandKind::show_screen:
      dashboard.navigation.show(command.screen);
      break;
    case controls::CommandKind::step_page:
      dashboard.slots.step(command.slot, command.delta, command.wrap);
      break;
    case controls::CommandKind::show_page:
      dashboard.slots.show(command.slot, command.page);
      break;
    case controls::CommandKind::hold_page:
      dashboard.slots.hold(command.slot, command.page);
      break;
    case controls::CommandKind::release_page:
      dashboard.slots.release(command.slot);
      break;
    case controls::CommandKind::dismiss_page:
      dashboard.slots.dismiss(command.slot);
      break;
    case controls::CommandKind::new_session:
      dashboard.slots.new_session();
      break;
  }
}

}

controls::DashboardTarget* control_target() {
  if (!g_control_target.start()) {
    log::error(kTag, "Buttons cannot reach the dashboard");
    return nullptr;
  }
  return &g_control_target;
}

}
