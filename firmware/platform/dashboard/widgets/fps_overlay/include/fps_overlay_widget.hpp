#pragma once

struct _lv_display_t;
using lv_display_t = _lv_display_t;
struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;

namespace simcore::dashboard::fps_overlay_widget {

class View final {
 public:
  View() = default;
  ~View();
  View(const View&) = delete;
  View& operator=(const View&) = delete;

  [[nodiscard]] bool create(lv_display_t* display);
  void destroy();

 private:
  static void update(lv_timer_t* timer);
  void render();

  lv_obj_t* label_{};
  lv_timer_t* timer_{};
};

}
