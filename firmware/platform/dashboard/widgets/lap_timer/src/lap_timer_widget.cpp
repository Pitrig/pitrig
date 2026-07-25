#include "lap_timer_widget.hpp"

#include <array>
#include <cstdint>
#include <cstdio>

#include "esp_lvgl_port.h"
#include "lap_timer.hpp"
#include "lvgl.h"
#include "simcore_features.hpp"

LV_FONT_DECLARE(simcore_timer_58_Bold);

namespace simcore::dashboard::lap_timer_widget {
namespace {

constexpr std::uint32_t kBackgroundColor = 0x0B0B0B;
constexpr std::uint32_t kTextColor = 0xE8E8E8;
#if SIMCORE_DEBUG
constexpr std::uint32_t kRenderPeriodMs = 8;
#else
constexpr std::uint32_t kRenderPeriodMs = 16;
#endif
constexpr std::int32_t kCharacterWidth = 35;
constexpr std::int32_t kCharacterCount = 9;
constexpr std::array<std::size_t, 7> kDigitPositions = {0, 1, 3, 4, 6, 7, 8};

void render(lv_obj_t* container) {
  constexpr std::uint32_t kMillisecondsPerSecond = 1'000;
  constexpr std::uint32_t kSecondsPerMinute = 60;

  const std::uint32_t milliseconds = simcore::lap_timer::current_time();
  const std::uint32_t total_seconds = milliseconds / kMillisecondsPerSecond;
  const std::uint32_t minutes = total_seconds / kSecondsPerMinute % 100;
  const std::uint32_t seconds = total_seconds % kSecondsPerMinute;
  const std::uint32_t remaining_milliseconds = milliseconds % kMillisecondsPerSecond;

  char text[kCharacterCount + 1];
  std::snprintf(text, sizeof(text), "%02lu:%02lu.%03lu", static_cast<unsigned long>(minutes),
                static_cast<unsigned long>(seconds),
                static_cast<unsigned long>(remaining_milliseconds));

  for (const std::size_t position : kDigitPositions) {
    lv_obj_t* label = lv_obj_get_child(container, static_cast<std::int32_t>(position));
    if (lv_label_get_text(label)[0] == text[position]) {
      continue;
    }

    const char digit[] = {text[position], '\0'};
    lv_label_set_text(label, digit);
  }
}

void update(lv_timer_t* timer) {
  render(static_cast<lv_obj_t*>(lv_timer_get_user_data(timer)));
}

}  // namespace

void create(lv_display_t* display) {
  lvgl_port_lock(0);
  lv_obj_t* screen = lv_display_get_screen_active(display);
  lv_obj_set_style_bg_color(screen, lv_color_hex(kBackgroundColor), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);

  lv_obj_t* container = lv_obj_create(screen);
  lv_obj_remove_style_all(container);
  lv_obj_set_size(container, kCharacterWidth * kCharacterCount,
                  lv_font_get_line_height(&simcore_timer_58_Bold));

  constexpr char kInitialText[] = "00:00.000";
  for (std::int32_t position = 0; position < kCharacterCount; ++position) {
    lv_obj_t* label = lv_label_create(container);
    lv_obj_remove_style_all(label);
    lv_obj_set_width(label, kCharacterWidth);
    lv_obj_set_pos(label, position * kCharacterWidth, 0);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_obj_set_style_text_font(label, &simcore_timer_58_Bold, LV_PART_MAIN);
    lv_obj_set_style_text_color(label, lv_color_hex(kTextColor), LV_PART_MAIN);

    const char character[] = {kInitialText[position], '\0'};
    lv_label_set_text(label, character);
  }

  render(container);
  lv_obj_center(container);
  lv_timer_create(update, kRenderPeriodMs, container);
  lvgl_port_unlock();
}

}  // namespace simcore::dashboard::lap_timer_widget
