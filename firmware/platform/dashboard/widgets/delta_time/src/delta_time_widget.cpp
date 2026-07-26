#include "delta_time_widget.hpp"

#include <array>
#include <cstdint>
#include <cstring>

#include "dashboard_fonts.hpp"
#include "dashboard_layout_internal.hpp"
#include "delta_time.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard::delta_time_widget {
namespace {

constexpr std::uint32_t kRenderPeriodMs = 16;

struct WidgetState {
  lv_obj_t* container{};
  lv_obj_t* scale_content{};
  lv_obj_t* fill{};
  std::array<lv_obj_t*, 2> markers{};
  lv_obj_t* border{};
  lv_obj_t* label{};
  std::array<char, delta_time::kTextCapacity> text{};
  std::uint32_t color_rgb{};
  std::uint32_t scale_color_rgb{};
  std::int16_t scale_fill_per_mille{};
  std::int32_t scale_center_x{};
  std::int32_t scale_half_width{};
  bool visible{};
  bool scale_enabled{};
  bool initialized{};
};

WidgetState widget_state;

void render() {
  const delta_time::PresentationState state = delta_time::presentation();
  if (!widget_state.initialized || widget_state.visible != state.visible) {
    if (state.visible) {
      lv_obj_remove_flag(widget_state.container, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(widget_state.container, LV_OBJ_FLAG_HIDDEN);
    }
    widget_state.visible = state.visible;
  }

  if (!widget_state.initialized ||
      widget_state.scale_enabled != state.scale_enabled) {
    lv_obj_set_style_border_opa(
        widget_state.border,
        state.scale_enabled ? LV_OPA_COVER : LV_OPA_TRANSP, LV_PART_MAIN);
    if (!state.scale_enabled) {
      lv_obj_add_flag(widget_state.fill, LV_OBJ_FLAG_HIDDEN);
    }
    for (lv_obj_t* const marker : widget_state.markers) {
      if (state.scale_enabled) {
        lv_obj_remove_flag(marker, LV_OBJ_FLAG_HIDDEN);
      } else {
        lv_obj_add_flag(marker, LV_OBJ_FLAG_HIDDEN);
      }
    }
    widget_state.scale_enabled = state.scale_enabled;
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

  if (state.visible &&
      (!widget_state.initialized || widget_state.color_rgb != state.color_rgb)) {
    lv_obj_set_style_text_color(widget_state.label,
                                lv_color_hex(state.color_rgb), LV_PART_MAIN);
    widget_state.color_rgb = state.color_rgb;
    if (state.scale_enabled) {
      lv_obj_set_style_border_color(widget_state.border,
                                    lv_color_hex(state.color_rgb), LV_PART_MAIN);
      for (lv_obj_t* const marker : widget_state.markers) {
        lv_obj_set_style_bg_color(marker, lv_color_hex(state.color_rgb),
                                  LV_PART_MAIN);
      }
    }
  }

  if (state.visible && state.scale_enabled &&
      (!widget_state.initialized ||
       widget_state.scale_color_rgb != state.scale_color_rgb)) {
    lv_obj_set_style_bg_color(widget_state.fill,
                              lv_color_hex(state.scale_color_rgb), LV_PART_MAIN);
    widget_state.scale_color_rgb = state.scale_color_rgb;
  }

  if (state.visible && state.scale_enabled &&
      (!widget_state.initialized ||
       widget_state.scale_fill_per_mille != state.scale_fill_per_mille)) {
    const std::int32_t magnitude =
        state.scale_fill_per_mille < 0
            ? -static_cast<std::int32_t>(state.scale_fill_per_mille)
            : state.scale_fill_per_mille;
    const std::int32_t width =
        widget_state.scale_half_width * magnitude / 1'000;
    if (width == 0) {
      lv_obj_add_flag(widget_state.fill, LV_OBJ_FLAG_HIDDEN);
    } else {
      const std::int32_t x =
          state.scale_fill_per_mille < 0
              ? widget_state.scale_center_x - width
              : widget_state.scale_center_x;
      lv_obj_set_x(widget_state.fill, x);
      lv_obj_set_width(widget_state.fill, width);
      lv_obj_remove_flag(widget_state.fill, LV_OBJ_FLAG_HIDDEN);
    }
    widget_state.scale_fill_per_mille = state.scale_fill_per_mille;
  }

  widget_state.initialized = true;
}

void update(lv_timer_t*) {
  render();
}

}  // namespace

bool create(lv_display_t* display, const Config& config) {
  if (display == nullptr || config.block.width <= 0 || config.block.height <= 0) {
    return false;
  }

  const lv_font_t* const font = fonts::resolve(config.font);
  const std::int32_t border_width = config.scale.border_width_px;
  const std::int32_t content_height =
      lv_font_get_line_height(font) + 2 * config.scale.vertical_padding_px;
  const std::int32_t container_height = content_height + 2 * border_width;
  const std::int32_t content_width = config.block.width - 2 * border_width;
  const std::int32_t marker_height = 2 * border_width;
  if (content_width <= 0 || content_height <= 0 ||
      container_height > config.block.height ||
      marker_height > content_height) {
    return false;
  }

  if (!lvgl_port_lock(0)) {
    return false;
  }
  lv_obj_t* const screen = lv_display_get_screen_active(display);
  lv_obj_t* const block = create_widget_block(screen, config.block);

  widget_state.container = lv_obj_create(block);
  lv_obj_remove_style_all(widget_state.container);
  lv_obj_set_size(widget_state.container, config.block.width, container_height);
  lv_obj_remove_flag(widget_state.container, LV_OBJ_FLAG_SCROLLABLE);
  apply_debug_widget_outline(widget_state.container);
  place_in_block(widget_state.container, config.placement);

  widget_state.scale_center_x = content_width / 2;
  widget_state.scale_half_width = content_width / 2;

  widget_state.scale_content = lv_obj_create(widget_state.container);
  lv_obj_remove_style_all(widget_state.scale_content);
  lv_obj_set_pos(widget_state.scale_content, border_width, border_width);
  lv_obj_set_size(widget_state.scale_content, content_width, content_height);
  const std::int32_t content_radius =
      config.scale.border_radius_px > border_width
          ? config.scale.border_radius_px - border_width
          : 0;
  lv_obj_set_style_radius(widget_state.scale_content, content_radius,
                          LV_PART_MAIN);
  lv_obj_set_style_clip_corner(widget_state.scale_content, true, LV_PART_MAIN);
  lv_obj_remove_flag(widget_state.scale_content, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(widget_state.scale_content, LV_OBJ_FLAG_OVERFLOW_VISIBLE);

  widget_state.fill = lv_obj_create(widget_state.scale_content);
  lv_obj_remove_style_all(widget_state.fill);
  lv_obj_set_pos(widget_state.fill, widget_state.scale_center_x, 0);
  lv_obj_set_size(widget_state.fill, 0, content_height);
  lv_obj_set_style_bg_opa(widget_state.fill, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_add_flag(widget_state.fill, LV_OBJ_FLAG_HIDDEN);

  const std::int32_t marker_width = border_width;
  constexpr std::array<std::int32_t, 2> kMarkerNumerators{1, 3};
  for (std::size_t index = 0; index < widget_state.markers.size(); ++index) {
    lv_obj_t* const marker = lv_obj_create(widget_state.scale_content);
    lv_obj_remove_style_all(marker);
    const std::int32_t marker_center_x =
        content_width * kMarkerNumerators[index] / 4;
    lv_obj_set_pos(marker, marker_center_x - marker_width / 2,
                   content_height - marker_height);
    lv_obj_set_size(marker, marker_width, marker_height);
    lv_obj_set_style_bg_opa(marker, LV_OPA_COVER, LV_PART_MAIN);
    widget_state.markers[index] = marker;
  }

  widget_state.border = lv_obj_create(widget_state.container);
  lv_obj_remove_style_all(widget_state.border);
  lv_obj_set_pos(widget_state.border, 0, 0);
  lv_obj_set_size(widget_state.border, config.block.width, container_height);
  lv_obj_set_style_border_width(widget_state.border, border_width, LV_PART_MAIN);
  lv_obj_set_style_radius(widget_state.border, config.scale.border_radius_px,
                          LV_PART_MAIN);
  lv_obj_set_style_border_opa(widget_state.border, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_remove_flag(widget_state.border, LV_OBJ_FLAG_SCROLLABLE);

  widget_state.label = lv_label_create(widget_state.container);
  lv_obj_remove_style_all(widget_state.label);
  lv_obj_set_style_text_align(widget_state.label, LV_TEXT_ALIGN_CENTER,
                              LV_PART_MAIN);
  lv_obj_set_style_text_font(widget_state.label, font, LV_PART_MAIN);
  lv_obj_center(widget_state.label);

  render();
  lv_timer_create(update, kRenderPeriodMs, nullptr);
  lvgl_port_unlock();
  return true;
}

}  // namespace simcore::dashboard::delta_time_widget
