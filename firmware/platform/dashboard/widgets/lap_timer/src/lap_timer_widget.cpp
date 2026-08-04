#include "lap_timer_widget.hpp"

#include <array>
#include <cstdint>
#include <cstdio>

#include "dashboard_fonts.hpp"
#include "dashboard_layout_internal.hpp"
#include "esp_lvgl_port.h"
#include "lap_timer.hpp"
#include "lvgl.h"
#include "simcore_features.hpp"

namespace simcore::dashboard::lap_timer_widget {
namespace {

constexpr std::uint32_t kBackgroundColor = 0x0B0B0B;
#if SIMCORE_DEBUG
constexpr std::uint32_t kRenderPeriodMs = 8;
#else
constexpr std::uint32_t kRenderPeriodMs = 16;
#endif
constexpr std::int32_t kCharacterCount = 9;
constexpr std::array<std::size_t, 7> kDigitPositions = {0, 1, 3, 4, 6, 7, 8};

struct WidgetContext {
  lv_obj_t* container{};
  lap_timer::LapTimer* module{};
};

WidgetContext widget_context;

void render(WidgetContext& context) {
  constexpr std::uint32_t kMillisecondsPerSecond = 1'000;
  constexpr std::uint32_t kSecondsPerMinute = 60;

  const std::uint32_t milliseconds = context.module->current_time();
  const std::uint32_t total_seconds = milliseconds / kMillisecondsPerSecond;
  const std::uint32_t minutes = total_seconds / kSecondsPerMinute % 100;
  const std::uint32_t seconds = total_seconds % kSecondsPerMinute;
  const std::uint32_t remaining_milliseconds = milliseconds % kMillisecondsPerSecond;

  char text[kCharacterCount + 1];
  std::snprintf(text, sizeof(text), "%02lu:%02lu.%03lu", static_cast<unsigned long>(minutes),
                static_cast<unsigned long>(seconds),
                static_cast<unsigned long>(remaining_milliseconds));

  for (const std::size_t position : kDigitPositions) {
    lv_obj_t* label = lv_obj_get_child(
        context.container, static_cast<std::int32_t>(position));
    if (lv_label_get_text(label)[0] == text[position]) {
      continue;
    }

    const char digit[] = {text[position], '\0'};
    lv_label_set_text(label, digit);
  }
}

void update(lv_timer_t* timer) {
  render(*static_cast<WidgetContext*>(lv_timer_get_user_data(timer)));
}

}  // namespace

bool create(const Layout& layout, const Config& config,
            lap_timer::LapTimer& module, const fonts::Registry& fonts) {
  if (layout.display == nullptr || !lvgl_port_lock(0)) {
    return false;
  }
  lv_obj_t* const screen = lv_display_get_screen_active(layout.display);
  lv_obj_set_style_bg_color(screen, lv_color_hex(kBackgroundColor), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);

  const lv_font_t* const font = fonts.resolve(config.font);
  const std::int32_t character_width =
      static_cast<std::int32_t>(lv_font_get_glyph_width(font, '0', '0'));
  const std::int32_t content_width = character_width * kCharacterCount;
  const std::int32_t content_height = lv_font_get_line_height(font);
  lv_obj_t* parent{};
  Rect bounds{};
  if (!resolve_widget_bounds(layout, config.placement, content_width,
                             content_height, false, parent, bounds)) {
    lvgl_port_unlock();
    return false;
  }

  lv_obj_t* container = lv_obj_create(parent);
  lv_obj_remove_style_all(container);
  lv_obj_set_pos(container, bounds.x, bounds.y);
  lv_obj_set_size(container, bounds.width, bounds.height);
  lv_obj_remove_flag(container, LV_OBJ_FLAG_SCROLLABLE);
  apply_debug_widget_outline(container);

  const std::int32_t content_x = (bounds.width - content_width) / 2;
  const std::int32_t content_y = (bounds.height - content_height) / 2;
  constexpr char kInitialText[] = "00:00.000";
  for (std::int32_t position = 0; position < kCharacterCount; ++position) {
    lv_obj_t* label = lv_label_create(container);
    lv_obj_remove_style_all(label);
    lv_obj_set_width(label, character_width);
    lv_obj_set_pos(label, content_x + position * character_width, content_y);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
    lv_obj_set_style_text_color(label, lv_color_hex(config.text_color),
                                LV_PART_MAIN);

    const char character[] = {kInitialText[position], '\0'};
    lv_label_set_text(label, character);
  }

  widget_context = {
      .container = container,
      .module = &module,
  };
  render(widget_context);
  lv_timer_create(update, kRenderPeriodMs, &widget_context);
  lvgl_port_unlock();
  return true;
}

}  // namespace simcore::dashboard::lap_timer_widget
