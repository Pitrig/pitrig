#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_event_t;
using lv_event_t = _lv_event_t;

namespace simcore::dashboard::navigation {

// Moves between the screens a dashboard composed, in configuration order and
// wrapping at both ends. The order and the gesture stay unauthored — the
// contract carries nothing for them — but any widget may declare a tap
// that navigates, and those bindings live here because this already owns the
// screens and the active index.
//
// Screens are owned by the composition; this only loads them.
class Controller final {
 public:
  Controller() = default;
  ~Controller();
  Controller(const Controller&) = delete;
  Controller& operator=(const Controller&) = delete;

  // Attaches the swipe handler to every screen and shows the first one. Safe to
  // call with a single screen, in which case navigation is inert. The caller
  // holds the LVGL lock; `screens` must outlive the controller or be replaced by
  // another attach()/detach() pair.
  void attach(std::span<lv_obj_t* const> screens);

  // Makes one object a tap target. `target` is the resolved screen index and is
  // read only by goto_screen. Called with the LVGL lock held, after the object
  // exists; returns false once the bounded table is full.
  //
  // Actions are re-bound after a widget is rebuilt in place, because that
  // produces a new LVGL object which carries neither the flag nor the callback.
  [[nodiscard]] bool add_action(lv_obj_t* object,
                                configuration::WidgetActionType type,
                                std::uint8_t target);

  // Removes the handlers and forgets the actions. Called before the screens
  // themselves are released.
  void detach();

  // Unbinds every action without touching the swipe handlers, so the composition
  // can bind them again onto a mix of surviving and rebuilt objects. Objects
  // that were rebuilt are already gone; the survivors have their callback
  // removed here, or a re-bind would stack a second one on them.
  void clear_actions();

  [[nodiscard]] std::size_t active_index() const { return active_; }

 private:
  // One tap target. The event carries a pointer to its own entry, so the
  // handler reaches both the controller and the target without allocating.
  struct Binding {
    Controller* controller{};
    lv_obj_t* object{};
    configuration::WidgetActionType type{};
    std::uint8_t target{};
  };

  static void on_gesture(lv_event_t* event);
  static void on_action(lv_event_t* event);
  void step(int delta);
  void show(std::size_t index);

  std::span<lv_obj_t* const> screens_{};
  std::size_t active_{};
  std::array<Binding, configuration::kMaximumActions> actions_{};
  std::size_t action_count_{};
};

}  // namespace simcore::dashboard::navigation
