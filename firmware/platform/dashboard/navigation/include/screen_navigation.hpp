#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "lvgl_types.hpp"

namespace pitrig::dashboard::navigation {

class Controller final {
 public:
  Controller() = default;
  ~Controller();
  Controller(const Controller&) = delete;
  Controller& operator=(const Controller&) = delete;

  using ScreenShown = void (*)(void* context);

  void attach(std::span<lv_obj_t* const> screens);

  void set_screen_shown(ScreenShown callback, void* context);

  [[nodiscard]] bool add_action(lv_obj_t* object, configuration::WidgetActionType type,
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

  enum class SyncPhase : std::uint8_t {
    idle,
    transitioning,
    settling,
  };

  static void on_gesture(lv_event_t* event);
  static void on_action(lv_event_t* event);
  static void on_screen_loaded(lv_event_t* event);
  static void on_refresh_ready(lv_event_t* event);
  void begin_tear_free();
  void end_tear_free();
  void step(int delta);
  void show(std::size_t index);
  void load(lv_obj_t* screen, bool forward);

  std::span<lv_obj_t* const> screens_{};
  std::size_t active_{};
  ScreenShown screen_shown_{};
  void* screen_shown_context_{};
  lv_display_t* display_{};
  SyncPhase sync_phase_{SyncPhase::idle};
  configuration::ScreenTransition transition_{configuration::ScreenTransition::slide};
  std::array<Binding, configuration::kMaximumActions> actions_{};
  std::size_t action_count_{};
};

}
