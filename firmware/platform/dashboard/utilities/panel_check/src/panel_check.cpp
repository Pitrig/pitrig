#include "panel_check.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>

#include "esp_lvgl_port.h"
#include "esp_random.h"

namespace pitrig::dashboard::panel_check {
namespace {

constexpr std::uint32_t kTryMs = 25'000;
constexpr std::uint32_t kHoldMs = 2'000;
constexpr std::uint32_t kTimerPeriodMs = 200;
constexpr std::int32_t kColumns = 3;
constexpr std::int32_t kRows = 2;
constexpr std::int32_t kGlyphPx = 8;
constexpr std::int32_t kRingGapPx = 12;
constexpr std::int32_t kRingWidthPx = 10;
constexpr std::int32_t kBorderPx = 4;
constexpr std::int32_t kCountdownHeightPx = 8;
constexpr std::uint32_t kInk = 0xF1F5F9;
constexpr std::uint32_t kAccent = 0x4ADE80;
constexpr std::uint32_t kTarget = 0x14532D;
constexpr std::uint32_t kTrack = 0x334155;

lv_obj_t* add_text(lv_obj_t* const parent, const char* const text, const std::int32_t center_y,
                   const std::int32_t scale) {
  lv_obj_t* const label = lv_label_create(parent);
  if (label == nullptr) {
    return nullptr;
  }
  lv_label_set_text(label, text);
  lv_obj_set_style_text_font(label, LV_FONT_DEFAULT, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, lv_color_hex(kInk), LV_PART_MAIN);
  lv_obj_set_style_transform_scale(label, scale * LV_SCALE_NONE, LV_PART_MAIN);
  lv_obj_set_style_transform_pivot_x(label, lv_pct(50), LV_PART_MAIN);
  lv_obj_set_style_transform_pivot_y(label, lv_pct(50), LV_PART_MAIN);
  lv_obj_align(label, LV_ALIGN_TOP_MID, 0, center_y - kGlyphPx / 2);
  return label;
}

lv_obj_t* add_box(lv_obj_t* const parent, const std::int32_t width, const std::int32_t height,
                  const std::uint32_t color) {
  lv_obj_t* const box = lv_obj_create(parent);
  if (box == nullptr) {
    return nullptr;
  }
  lv_obj_remove_style_all(box);
  lv_obj_set_size(box, width, height);
  lv_obj_set_style_bg_color(box, lv_color_hex(color), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(box, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_clickable(box, false);
  lv_obj_set_scrollable(box, false);
  return box;
}

}

bool Check::show(lv_display_t* const display, lv_obj_t* const layer, const Request& request) {
  if (display == nullptr || layer == nullptr || request.panel_count < 2 ||
      request.done == nullptr || !lvgl_port_lock(0)) {
    return false;
  }
  bool shown = false;
  if (container_ == nullptr && !finished_) {
    request_ = request;
    shown = build(display, layer);
    if (shown) {
      shown_tick_ = lv_tick_get();
      timer_ = lv_timer_create(on_timer, kTimerPeriodMs, this);
      shown = timer_ != nullptr;
    }
    if (shown) {
      count_down();
    } else if (container_ != nullptr) {
      lv_obj_delete(container_);
      container_ = nullptr;
    }
  }
  lvgl_port_unlock();
  return shown;
}

bool Check::build(lv_display_t* const display, lv_obj_t* const layer) {
  const std::int32_t width = lv_display_get_horizontal_resolution(display);
  const std::int32_t height = lv_display_get_vertical_resolution(display);
  container_ = add_box(layer, width, height, 0x000000);
  if (container_ == nullptr) {
    return false;
  }
  lv_obj_set_clickable(container_, true);
  lv_obj_set_gesture_bubble(container_, false);

  const std::int32_t lead = height / 5;
  if (add_text(container_, "SCREEN CHECK", height / 12, 4) == nullptr ||
      add_text(container_, "HOLD THE TICK FOR TWO SECONDS", lead, 3) == nullptr ||
      add_text(container_, "IF THIS PICTURE LOOKS RIGHT", lead + 4 * kGlyphPx, 3) == nullptr) {
    return false;
  }
  remaining_ = add_text(container_, "", height - 4 * kGlyphPx, 2);
  countdown_ = add_box(container_, width, kCountdownHeightPx, kAccent);
  if (remaining_ == nullptr || countdown_ == nullptr) {
    return false;
  }
  lv_obj_set_pos(countdown_, 0, height - kCountdownHeightPx);
  countdown_width_ = width;
  return place_target(width, height);
}

bool Check::place_target(const std::int32_t width, const std::int32_t height) {
  const auto cell =
      static_cast<std::int32_t>(esp_random() % static_cast<std::uint32_t>(kColumns * kRows));
  const std::int32_t top = height * 19 / 60;
  const std::int32_t bottom = height - height / 10;
  const std::int32_t center_x = width * (2 * (cell % kColumns) + 1) / (2 * kColumns);
  const std::int32_t center_y = top + (bottom - top) * (2 * (cell / kColumns) + 1) / (2 * kRows);
  const std::int32_t diameter = std::min(height / 4, width / 7);
  const std::int32_t ring = diameter + 2 * (kRingGapPx + kRingWidthPx);

  ring_ = lv_arc_create(container_);
  lv_obj_t* const target = add_box(container_, diameter, diameter, kTarget);
  if (ring_ == nullptr || target == nullptr) {
    return false;
  }
  lv_obj_remove_style_all(ring_);
  lv_obj_set_size(ring_, ring, ring);
  lv_obj_set_pos(ring_, center_x - ring / 2, center_y - ring / 2);
  lv_arc_set_rotation(ring_, 270);
  lv_arc_set_bg_angles(ring_, 0, 360);
  lv_arc_set_range(ring_, 0, static_cast<std::int32_t>(kHoldMs));
  lv_arc_set_value(ring_, 0);
  lv_obj_set_clickable(ring_, false);
  lv_obj_set_style_arc_width(ring_, kRingWidthPx, LV_PART_MAIN);
  lv_obj_set_style_arc_color(ring_, lv_color_hex(kTrack), LV_PART_MAIN);
  lv_obj_set_style_arc_width(ring_, kRingWidthPx, LV_PART_INDICATOR);
  lv_obj_set_style_arc_color(ring_, lv_color_hex(kAccent), LV_PART_INDICATOR);

  lv_obj_set_pos(target, center_x - diameter / 2, center_y - diameter / 2);
  lv_obj_set_style_radius(target, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  lv_obj_set_style_border_color(target, lv_color_hex(kAccent), LV_PART_MAIN);
  lv_obj_set_style_border_width(target, kBorderPx, LV_PART_MAIN);
  lv_obj_set_clickable(target, true);
  for (const lv_event_code_t code :
       {LV_EVENT_PRESSED, LV_EVENT_PRESSING, LV_EVENT_RELEASED, LV_EVENT_PRESS_LOST}) {
    lv_obj_add_event_cb(target, on_target, code, this);
  }

  lv_obj_t* const mark = lv_line_create(target);
  if (mark == nullptr) {
    return false;
  }
  const auto at = [diameter](const std::int32_t percent) {
    return static_cast<lv_value_precise_t>(diameter * percent / 100);
  };
  mark_[0] = {.x = at(27), .y = at(50)};
  mark_[1] = {.x = at(43), .y = at(66)};
  mark_[2] = {.x = at(72), .y = at(33)};
  lv_line_set_points(mark, mark_.data(), static_cast<std::uint32_t>(mark_.size()));
  lv_obj_set_style_line_width(mark, diameter / 10, LV_PART_MAIN);
  lv_obj_set_style_line_color(mark, lv_color_hex(kAccent), LV_PART_MAIN);
  lv_obj_set_style_line_rounded(mark, true, LV_PART_MAIN);
  lv_obj_set_clickable(mark, false);
  return true;
}

void Check::on_target(lv_event_t* const event) {
  auto* const check = static_cast<Check*>(lv_event_get_user_data(event));
  if (check != nullptr) {
    check->hold(lv_event_get_code(event));
  }
}

void Check::on_timer(lv_timer_t* const timer) {
  auto* const check = static_cast<Check*>(lv_timer_get_user_data(timer));
  if (check != nullptr) {
    check->count_down();
  }
}

void Check::hold(const lv_event_code_t code) {
  if (finished_ || ring_ == nullptr) {
    return;
  }
  if (code == LV_EVENT_PRESSED) {
    pressing_ = true;
    press_tick_ = lv_tick_get();
    lv_arc_set_value(ring_, 0);
  } else if (code == LV_EVENT_PRESSING && pressing_) {
    const std::uint32_t held = std::min(lv_tick_elaps(press_tick_), kHoldMs);
    lv_arc_set_value(ring_, static_cast<std::int32_t>(held));
    if (held >= kHoldMs) {
      finish(true);
    }
  } else if (code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST) {
    pressing_ = false;
    lv_arc_set_value(ring_, 0);
  }
}

void Check::count_down() {
  if (finished_) {
    return;
  }
  const std::uint32_t elapsed = lv_tick_elaps(shown_tick_);
  if ((elapsed >= kTryMs && !pressing_) || elapsed >= kTryMs + kHoldMs) {
    if (request_.postpone != nullptr && request_.postpone(request_.context)) {
      shown_tick_ = lv_tick_get();
      return;
    }
    finish(false);
    return;
  }
  const std::uint32_t left_ms = elapsed >= kTryMs ? 0 : kTryMs - elapsed;
  const std::int64_t bar = static_cast<std::int64_t>(countdown_width_) * left_ms / kTryMs;
  lv_obj_set_width(countdown_, static_cast<std::int32_t>(bar));
  const std::uint32_t seconds = (left_ms + 999U) / 1'000U;
  if (seconds == shown_seconds_ && lv_label_get_text(remaining_)[0] != '\0') {
    return;
  }
  shown_seconds_ = seconds;
  std::array<char, 40> text{};
  (void)std::snprintf(text.data(), text.size(), "PANEL %u OF %u   NEXT IN %lu S",
                      static_cast<unsigned>(request_.panel + 1U),
                      static_cast<unsigned>(request_.panel_count),
                      static_cast<unsigned long>(seconds));
  lv_label_set_text(remaining_, text.data());
}

void Check::finish(const bool confirmed) {
  if (finished_) {
    return;
  }
  finished_ = true;
  pressing_ = false;
  if (timer_ != nullptr) {
    lv_timer_delete(timer_);
    timer_ = nullptr;
  }
  if (container_ != nullptr) {
    lv_obj_delete_async(container_);
    container_ = nullptr;
    ring_ = nullptr;
    countdown_ = nullptr;
    remaining_ = nullptr;
  }
  request_.done(confirmed, request_.panel, request_.context);
}

}
