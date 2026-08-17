#include "screen_navigation.hpp"

#include <cstdint>

#include "lvgl.h"

namespace simcore::dashboard::navigation {
namespace {

constexpr std::uint32_t kTransitionMs = 200;

}  // namespace

Controller::~Controller() { detach(); }

void Controller::attach(const std::span<lv_obj_t* const> screens) {
  detach();
  screens_ = screens;
  active_ = 0;
  if (screens_.size() < 2) {
    // One screen has nowhere to go, and the handler would only cost an event
    // dispatch per gesture. Tap targets are still bound: an action on a
    // single-screen document navigates nowhere rather than being an error.
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

void Controller::clear_actions() {
  // The objects the callbacks sit on are owned by the composition and are
  // deleted or rebuilt by it, which takes the callbacks with them; forgetting
  // the bindings is all this owns.
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
  binding = {.controller = this, .type = type, .target = target};
  ++action_count_;
  // Widgets are built refusing clicks; a tap target is the one place that is
  // undone, and it is the composition rather than the widget type doing it.
  lv_obj_add_flag(object, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(object, on_action, LV_EVENT_CLICKED, &binding);
  return true;
}

void Controller::on_action(lv_event_t* const event) {
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

// A tap that names the screen already shown is not a transition, so it animates
// nothing rather than sliding the screen out and back.
void Controller::show(const std::size_t index) {
  if (index >= screens_.size() || index == active_) {
    return;
  }
  lv_obj_t* const screen = screens_[index];
  if (screen == nullptr) {
    return;
  }
  lv_screen_load_anim(screen,
                      index > active_ ? LV_SCREEN_LOAD_ANIM_MOVE_LEFT
                                      : LV_SCREEN_LOAD_ANIM_MOVE_RIGHT,
                      kTransitionMs, 0, false);
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
  // Wrapping in both directions, computed without a signed modulo.
  const std::size_t next =
      delta > 0 ? (active_ + 1) % count : (active_ + count - 1) % count;
  lv_obj_t* const screen = screens_[next];
  if (screen == nullptr) {
    return;
  }
  // The screen being left is kept: screens outlive navigation and only a
  // configuration replacement destroys them.
  lv_screen_load_anim(screen,
                      delta > 0 ? LV_SCREEN_LOAD_ANIM_MOVE_LEFT
                                : LV_SCREEN_LOAD_ANIM_MOVE_RIGHT,
                      kTransitionMs, 0, false);
  active_ = next;
}

}  // namespace simcore::dashboard::navigation
