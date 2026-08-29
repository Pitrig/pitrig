#include "screen_navigation.hpp"

#include "simcore_features.hpp"

#include <cstdint>

#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard::navigation {
namespace {

constexpr std::uint32_t kTransitionMs = 200;

bool gesture_in_progress() {
  const lv_indev_t* const indev = lv_indev_active();
  return indev != nullptr && lv_indev_get_gesture_dir(indev) != LV_DIR_NONE;
}

}

Controller::~Controller() { detach(); }

void Controller::attach(const std::span<lv_obj_t* const> screens) {
  detach();
  screens_ = screens;
  active_ = 0;
  if (screens_.size() < 2) {
    return;
  }
  for (lv_obj_t* const screen : screens_) {
    if (screen != nullptr) {
      lv_obj_add_event_cb(screen, on_gesture, LV_EVENT_GESTURE, this);
      lv_obj_add_event_cb(screen, on_screen_loaded, LV_EVENT_SCREEN_LOADED, this);
      if (display_ == nullptr) {
        display_ = lv_obj_get_display(screen);
      }
    }
  }
  if (display_ != nullptr) {
    lv_display_add_event_cb(display_, on_refresh_ready, LV_EVENT_REFR_READY, this);
  }
}

void Controller::detach() {
  for (lv_obj_t* const screen : screens_) {
    if (screen != nullptr) {
      (void)lv_obj_remove_event_cb_with_user_data(screen, on_gesture, this);
      (void)lv_obj_remove_event_cb_with_user_data(screen, on_screen_loaded, this);
    }
  }
  if (display_ != nullptr) {
    (void)lv_display_remove_event_cb_with_user_data(display_, on_refresh_ready, this);
    end_tear_free();
    display_ = nullptr;
  }
  sync_phase_ = SyncPhase::idle;
  clear_actions();
  screens_ = {};
  active_ = 0;
}

void Controller::set_transition(
    const configuration::ScreenTransition transition) {
  transition_ = transition;
}

void Controller::clear_actions() {
  for (std::size_t index = 0; index < action_count_; ++index) {
    Binding& binding = actions_[index];
    if (binding.object != nullptr) {
      (void)lv_obj_remove_event_cb_with_user_data(binding.object, on_action,
                                                  &binding);
      lv_obj_remove_flag(binding.object, LV_OBJ_FLAG_CLICKABLE);
    }
  }
  actions_ = {};
  action_count_ = 0;
}

bool Controller::add_action(lv_obj_t* const object,
                            const configuration::WidgetActionType type,
                            const std::uint8_t target) {
  if (object == nullptr || type == configuration::WidgetActionType::none) {
    return true;
  }
  if (action_count_ >= actions_.size()) {
    return false;
  }
  Binding& binding = actions_[action_count_];
  binding = {.controller = this, .object = object, .type = type, .target = target};
  ++action_count_;
  lv_obj_add_flag(object, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(object, on_action, LV_EVENT_CLICKED, &binding);
  return true;
}

void Controller::on_action(lv_event_t* const event) {
  if (gesture_in_progress()) {
    return;
  }
  auto* const binding = static_cast<Binding*>(lv_event_get_user_data(event));
  if (binding == nullptr || binding->controller == nullptr) {
    return;
  }
  switch (binding->type) {
    case configuration::WidgetActionType::next_screen:
      binding->controller->step(1);
      break;
    case configuration::WidgetActionType::previous_screen:
      binding->controller->step(-1);
      break;
    case configuration::WidgetActionType::goto_screen:
      binding->controller->show(binding->target);
      break;
    case configuration::WidgetActionType::none:
      break;
  }
}

void Controller::begin_tear_free() {
  if (display_ == nullptr || SIMCORE_DISPLAY_RENDER_TEAR_FREE != 0) {
    return;
  }
  if (lvgl_port_disp_set_tear_free(display_, true) == ESP_OK) {
    sync_phase_ = SyncPhase::transitioning;
  }
}

void Controller::end_tear_free() {
  if (display_ != nullptr && SIMCORE_DISPLAY_RENDER_TEAR_FREE == 0) {
    (void)lvgl_port_disp_set_tear_free(display_, false);
  }
  sync_phase_ = SyncPhase::idle;
}

void Controller::on_screen_loaded(lv_event_t* const event) {
  auto* const controller =
      static_cast<Controller*>(lv_event_get_user_data(event));
  if (controller == nullptr ||
      controller->sync_phase_ != SyncPhase::transitioning) {
    return;
  }
  controller->sync_phase_ = SyncPhase::settling;
  lv_obj_t* const active = lv_screen_active();
  if (active != nullptr) {
    lv_obj_invalidate(active);
  }
}

void Controller::on_refresh_ready(lv_event_t* const event) {
  auto* const controller =
      static_cast<Controller*>(lv_event_get_user_data(event));
  if (controller != nullptr &&
      controller->sync_phase_ == SyncPhase::settling) {
    controller->end_tear_free();
  }
}

void Controller::load(lv_obj_t* const screen, const bool forward) {
  begin_tear_free();
  if (transition_ == configuration::ScreenTransition::none) {
    lv_screen_load(screen);
    return;
  }
  lv_screen_load_anim(screen,
                      forward ? LV_SCREEN_LOAD_ANIM_MOVE_LEFT
                              : LV_SCREEN_LOAD_ANIM_MOVE_RIGHT,
                      kTransitionMs, 0, false);
}

void Controller::show(const std::size_t index) {
  if (index >= screens_.size() || index == active_) {
    return;
  }
  lv_obj_t* const screen = screens_[index];
  if (screen == nullptr) {
    return;
  }
  load(screen, index > active_);
  active_ = index;
}

void Controller::on_gesture(lv_event_t* const event) {
  auto* const controller =
      static_cast<Controller*>(lv_event_get_user_data(event));
  lv_indev_t* const indev = lv_indev_active();
  if (controller == nullptr || indev == nullptr) {
    return;
  }
  const lv_dir_t direction = lv_indev_get_gesture_dir(indev);
  if (direction != LV_DIR_LEFT && direction != LV_DIR_RIGHT) {
    return;
  }
  lv_indev_wait_release(indev);
  controller->step(direction == LV_DIR_LEFT ? 1 : -1);
}

void Controller::step(const int delta) {
  const std::size_t count = screens_.size();
  if (count < 2) {
    return;
  }
  const std::size_t next =
      delta > 0 ? (active_ + 1) % count : (active_ + count - 1) % count;
  lv_obj_t* const screen = screens_[next];
  if (screen == nullptr) {
    return;
  }
  load(screen, delta > 0);
  active_ = next;
}

}
