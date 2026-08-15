#pragma once

#include <array>
#include <cstdint>

#include "application_configuration.hpp"
#include "dashboard_layout.hpp"
#include "delta_time.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;

namespace simcore::dashboard::fonts {
class Registry;
}

namespace simcore::dashboard::delta_time_widget {

using ScaleStyle = configuration::DeltaTimeScaleStyle;
using Config = configuration::DeltaTimeWidgetConfiguration;

// Owns the LVGL objects, timer, and cached presentation state for one widget.
class View final {
 public:
  View() = default;
  ~View();
  View(const View&) = delete;
  View& operator=(const View&) = delete;

  [[nodiscard]] bool create(const Layout& layout, const Config& config,
                            const delta_time::DeltaTime& module,
                            const fonts::Registry& fonts);
  [[nodiscard]] lv_obj_t* root_object() const { return state_.container; }
  void destroy();

  // Marks the render timer ready so the next LVGL pass re-reads the module
  // state instead of waiting for the period to elapse. Caller holds the LVGL
  // lock. A no-op while the widget does not exist.
  void wake();

 private:
  struct State {
    const delta_time::DeltaTime* module{};
    lv_obj_t* container{};
    lv_obj_t* scale_content{};
    lv_obj_t* fill{};
    std::array<lv_obj_t*, 2> markers{};
    lv_obj_t* border{};
    lv_obj_t* label{};
    std::array<char, delta_time::kTextCapacity> text{};
    std::uint32_t color_rgb{};
    std::uint32_t scale_color_rgb{};
    std::uint32_t faster_color_rgb{};
    std::uint32_t slower_color_rgb{};
    std::uint32_t neutral_color_rgb{};
    std::int16_t scale_fill_per_mille{};
    std::int32_t scale_center_x{};
    std::int32_t scale_half_width{};
    bool visible{};
    bool scale_enabled{};
    bool initialized{};
  };

  static void update(lv_timer_t* timer);
  void render();

  State state_{};
  lv_timer_t* timer_{};
  bool created_{};
};

}  // namespace simcore::dashboard::delta_time_widget
