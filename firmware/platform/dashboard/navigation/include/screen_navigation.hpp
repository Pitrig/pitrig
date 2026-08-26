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

class Controller final {
 public:
  Controller() = default;
  ~Controller();
  Controller(const Controller&) = delete;
  Controller& operator=(const Controller&) = delete;

  void attach(std::span<lv_obj_t* const> screens);

  [[nodiscard]] bool add_action(lv_obj_t* object,
                                configuration::WidgetActionType type,
                                std::uint8_t target);

  void set_transition(configuration::ScreenTransition transition);

  void detach();

  void clear_actions();

 private:
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
  void load(lv_obj_t* screen, bool forward);

  std::span<lv_obj_t* const> screens_{};
  std::size_t active_{};
  configuration::ScreenTransition transition_{
      configuration::ScreenTransition::slide};
  std::array<Binding, configuration::kMaximumActions> actions_{};
  std::size_t action_count_{};
};

}
