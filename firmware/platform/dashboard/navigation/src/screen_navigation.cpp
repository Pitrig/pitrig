#include "screen_navigation.hpp"

#include <cstdint>

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
    }
  }
}

void Controller::detach() {
  for (lv_obj_t* const screen : screens_) {
    if (screen != nullptr) {
      (void)lv_obj_remove_event_cb_with_user_data(screen, on_gesture, this);
    }
  }
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

void Controller::load(lv_obj_t* const screen, const bool forward) {
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
  if (controller == nullptr) {
    return;
  }
  const lv_dir_t direction = lv_indev_get_gesture_dir(lv_indev_active());
  if (direction == LV_DIR_LEFT) {
    controller->step(1);
  } else if (direction == LV_DIR_RIGHT) {
    controller->step(-1);
  }
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
