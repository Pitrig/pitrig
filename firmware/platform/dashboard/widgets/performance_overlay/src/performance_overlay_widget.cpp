#include "performance_overlay_widget.hpp"

#include <cstdint>
#include <cstdio>

#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "performance.hpp"

namespace simcore::dashboard::performance_overlay_widget {
namespace {

constexpr std::uint32_t kBackgroundColor = 0x0B0B0B;
constexpr std::uint32_t kTextColor = 0xE8E8E8;
constexpr std::uint32_t kUpdatePeriodMs = 1'000;
constexpr std::int32_t kPadding = 3;

void render(lv_obj_t* label) {
  const performance::PerformanceStats stats = performance::get_stats();
  char text[96];
  std::snprintf(text, sizeof(text),
                "FPS %.0f\n"
                "C0 %.0f%%\n"
                "C1 %.0f%%\n"
                "R %.1fms\n"
                "F %.1fms\n"
                "H %luK",
                static_cast<double>(stats.fps), static_cast<double>(stats.cpu_core0),
                static_cast<double>(stats.cpu_core1),
                static_cast<double>(stats.render_time_us) / 1'000.0,
                static_cast<double>(stats.flush_time_us) / 1'000.0,
                static_cast<unsigned long>(stats.free_heap / 1'024));
  lv_label_set_text(label, text);
}

void update(lv_timer_t* timer) {
  render(static_cast<lv_obj_t*>(lv_timer_get_user_data(timer)));
}

}  // namespace

void create(lv_display_t* display) {
  lvgl_port_lock(0);
  lv_obj_t* label = lv_label_create(lv_display_get_layer_top(display));
  lv_obj_remove_style_all(label);
  lv_obj_set_style_bg_color(label, lv_color_hex(kBackgroundColor), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(label, LV_OPA_70, LV_PART_MAIN);
  lv_obj_set_style_pad_all(label, kPadding, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, lv_color_hex(kTextColor), LV_PART_MAIN);
  lv_obj_set_style_text_font(label, &lv_font_montserrat_10, LV_PART_MAIN);
  lv_obj_set_style_text_line_space(label, 0, LV_PART_MAIN);
  lv_obj_align(label, LV_ALIGN_TOP_RIGHT, -kPadding, kPadding);

  render(label);
  lv_timer_create(update, kUpdatePeriodMs, label);
  lvgl_port_unlock();
}

}  // namespace simcore::dashboard::performance_overlay_widget
