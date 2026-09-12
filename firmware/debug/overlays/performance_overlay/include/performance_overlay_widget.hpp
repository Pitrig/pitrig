#pragma once

#include <cstdint>

#include "lvgl_types.hpp"

namespace pitrig::transport {
class ITransport;
}

namespace pitrig::dashboard::performance_overlay_widget {

class View final {
 public:
  View() = default;
  ~View();
  View(const View&) = delete;
  View& operator=(const View&) = delete;

  [[nodiscard]] bool create(lv_display_t* display, const transport::ITransport& transport);
  void destroy();

 private:
  static void update(lv_timer_t* timer);
  void render();

  const transport::ITransport* transport_{};
  lv_obj_t* label_{};
  lv_timer_t* timer_{};
  std::uint64_t previous_received_bytes_{};
  std::uint64_t previous_read_events_{};
};

}
