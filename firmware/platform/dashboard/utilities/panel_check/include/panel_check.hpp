#pragma once

#include <array>
#include <cstdint>

#include "lvgl.h"

namespace pitrig::dashboard::panel_check {

using Done = void (*)(bool confirmed, std::uint8_t panel, void* context);
using Postpone = bool (*)(void* context);

struct Request {
  std::uint8_t panel{};
  std::uint8_t panel_count{};
  Done done{};
  Postpone postpone{};
  void* context{};
};

class Check final {
 public:
  Check() = default;
  Check(const Check&) = delete;
  Check& operator=(const Check&) = delete;

  [[nodiscard]] bool show(lv_display_t* display, lv_obj_t* layer, const Request& request);

 private:
  static void on_target(lv_event_t* event);
  static void on_timer(lv_timer_t* timer);
  [[nodiscard]] bool build(lv_display_t* display, lv_obj_t* layer);
  [[nodiscard]] bool place_target(std::int32_t width, std::int32_t height);
  void hold(lv_event_code_t code);
  void count_down();
  void finish(bool confirmed);

  Request request_{};
  lv_obj_t* container_{};
  lv_obj_t* ring_{};
  lv_obj_t* countdown_{};
  lv_obj_t* remaining_{};
  lv_timer_t* timer_{};
  std::array<lv_point_precise_t, 3> mark_{};
  std::uint32_t shown_tick_{};
  std::uint32_t press_tick_{};
  std::uint32_t shown_seconds_{};
  std::int32_t countdown_width_{};
  bool pressing_{};
  bool finished_{};
};

}
