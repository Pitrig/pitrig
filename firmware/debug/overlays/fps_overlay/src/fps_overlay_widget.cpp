#include "fps_overlay_widget.hpp"

#include <cstdint>
#include <cstdio>
#include <cstring>

#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "performance.hpp"

namespace simcore::dashboard::fps_overlay_widget {
namespace {

constexpr std::uint32_t kBackgroundColor = 0x0B0B0B;
constexpr std::uint32_t kTextColor = 0xE8E8E8;
constexpr std::uint32_t kUpdatePeriodMs = 1'000;
constexpr std::int32_t kPadding = 3;
}

View::~View() { destroy(); }

void View::render() {
  const performance::PerformanceStats stats = performance::get_stats();
  char text[8];
  std::snprintf(text, sizeof(text), "%.0f", static_cast<double>(stats.fps));
  const char* const displayed = lv_label_get_text(label_);
  if (displayed == nullptr || std::strcmp(displayed, text) != 0) {
    lv_label_set_text(label_, text);
  }
}

void View::update(lv_timer_t* const timer) {
  auto* const view = static_cast<View*>(lv_timer_get_user_data(timer));
  if (view != nullptr) {
    view->render();
  }
}

bool View::create(lv_display_t* const display) {
  if (display == nullptr || label_ != nullptr || !lvgl_port_lock(0)) {
    return false;
  }
  label_ = lv_label_create(lv_display_get_layer_top(display));
  lv_obj_remove_style_all(label_);
  lv_obj_set_style_bg_color(label_, lv_color_hex(kBackgroundColor), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(label_, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_pad_all(label_, kPadding, LV_PART_MAIN);
  lv_obj_set_style_text_color(label_, lv_color_hex(kTextColor), LV_PART_MAIN);
  lv_obj_set_style_text_font(label_, LV_FONT_DEFAULT, LV_PART_MAIN);
  lv_obj_align(label_, LV_ALIGN_TOP_RIGHT, -kPadding, kPadding);

  render();
  timer_ = lv_timer_create(update, kUpdatePeriodMs, this);
  if (timer_ == nullptr) {
    lv_obj_delete(label_);
    label_ = nullptr;
    lvgl_port_unlock();
    return false;
  }
  lvgl_port_unlock();
  return true;
}

void View::destroy() {
  if (label_ == nullptr || !lvgl_port_lock(0)) {
    return;
  }
  if (timer_ != nullptr) {
    lv_timer_delete(timer_);
    timer_ = nullptr;
  }
  lv_obj_delete(label_);
  label_ = nullptr;
  lvgl_port_unlock();
}

}
