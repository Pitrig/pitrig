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
// wrapping at both ends. The order and the gesture stay unauthored; how a move
// is drawn does not — a dashboard says whether it slides or swaps in one frame,
// because the slide composites both screens for its whole duration and a screen
// filled with widgets cannot always pay for that. Any widget may declare a tap
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

  // Attaches the swipe handler to every screen and takes the first one as the
  // active screen; loading it is the composition's business. Safe to call with
  // a single screen, in which case navigation is inert. The caller holds the
  // LVGL lock; `screens` must outlive the controller or be replaced by another
  // attach()/detach() pair.
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

  // How every move between screens is drawn, from the document being applied.
  // Set beside attach() by a full composition and again by every incremental
  // apply, because a document may change this and nothing else. It is a
  // property of the document rather than of the screens, so an attach/detach
  // pair neither carries it nor clears it.
  void set_transition(configuration::ScreenTransition transition);

  // Removes the handlers and forgets the actions. Called before the screens
  // themselves are released.
  void detach();

  // Unbinds every action without touching the swipe handlers, so the composition
  // can bind them again onto a mix of surviving and rebuilt objects. Objects
  // that were rebuilt are already gone; the survivors have their callback
  // removed here, or a re-bind would stack a second one on them.
  void clear_actions();

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
  // Loads one screen the way the document asked for, `forward` naming the
  // direction the slide travels. Both ways of reaching a screen — the gesture
  // and a tap — come through here, so neither can be drawn differently.
  void load(lv_obj_t* screen, bool forward);

  std::span<lv_obj_t* const> screens_{};
  std::size_t active_{};
  configuration::ScreenTransition transition_{
      configuration::ScreenTransition::slide};
  std::array<Binding, configuration::kMaximumActions> actions_{};
  std::size_t action_count_{};
};

}  // namespace simcore::dashboard::navigation
