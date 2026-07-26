#include "estimated_lap_time_widget.hpp"

#include <array>
#include <cstdint>
#include <cstring>

#include "dashboard_fonts.hpp"
#include "dashboard_layout_internal.hpp"
#include "esp_lvgl_port.h"
#include "estimated_lap_time.hpp"
#include "lvgl.h"

namespace simcore::dashboard::estimated_lap_time_widget {
namespace {

constexpr std::uint32_t kRenderPeriodMs = 50;
constexpr std::int32_t kCharacterCount = 9;

struct WidgetState {
  lv_obj_t* container{};
  lv_obj_t* label{};
  std::array<char, estimated_lap_time::kTextCapacity> text{};
  bool visible{};
  bool initialized{};
};

WidgetState widget_state;

void render() {
  const estimated_lap_time::PresentationState state =
      estimated_lap_time::presentation();

  if (!widget_state.initialized || widget_state.visible != state.visible) {
    if (state.visible) {
      lv_obj_remove_flag(widget_state.container, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(widget_state.container, LV_OBJ_FLAG_HIDDEN);
    }
    widget_state.visible = state.visible;
  }

  if (state.visible &&
      (!widget_state.initialized ||
       std::strncmp(widget_state.text.data(), state.text.data(),
                    widget_state.text.size()) != 0)) {
    widget_state.text = state.text;
    widget_state.text.back() = '\0';
    lv_label_set_text_static(widget_state.label, widget_state.text.data());
    lv_obj_invalidate(widget_state.label);
  }

  widget_state.initialized = true;
}

void update(lv_timer_t*) {
  render();
}

}  // namespace

bool create(const Layout& layout, const Config& config) {
  if (layout.display == nullptr || !lvgl_port_lock(0)) {
    return false;
  }

  const lv_font_t* const font = fonts::resolve(config.font);
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

  widget_state.container = lv_obj_create(parent);
  lv_obj_remove_style_all(widget_state.container);
  lv_obj_set_pos(widget_state.container, bounds.x, bounds.y);
  lv_obj_set_size(widget_state.container, bounds.width, bounds.height);
  lv_obj_remove_flag(widget_state.container, LV_OBJ_FLAG_SCROLLABLE);
  apply_debug_widget_outline(widget_state.container);

  widget_state.label = lv_label_create(widget_state.container);
  lv_obj_remove_style_all(widget_state.label);
  lv_obj_set_style_text_align(widget_state.label, LV_TEXT_ALIGN_CENTER,
                              LV_PART_MAIN);
  lv_obj_set_style_text_font(widget_state.label, font, LV_PART_MAIN);
  lv_obj_set_style_text_color(widget_state.label,
                              lv_color_hex(config.text_color_rgb), LV_PART_MAIN);
  lv_obj_center(widget_state.label);

  render();
  lv_timer_create(update, kRenderPeriodMs, nullptr);
  lvgl_port_unlock();
  return true;
}

}  // namespace simcore::dashboard::estimated_lap_time_widget
