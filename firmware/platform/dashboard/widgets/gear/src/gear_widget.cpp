#include "gear_widget.hpp"

#include <array>
#include <cstdint>
#include <cstdio>
#include <cstring>

#include "dashboard_fonts.hpp"
#include "dashboard_layout_internal.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "telemetry_state.hpp"

namespace simcore::dashboard::gear_widget {
namespace {

constexpr std::uint32_t kRenderPeriodMs = 50;
constexpr std::size_t kTextCapacity = 5;

struct WidgetState {
  const telemetry::ITelemetryReader* telemetry{};
  lv_obj_t* label{};
  std::array<char, kTextCapacity> text{};
  bool initialized{};
};

WidgetState widget_state;

void format_gear(const telemetry::TelemetrySnapshot& snapshot,
                 std::array<char, kTextCapacity>& text) {
  if (!telemetry::contains(snapshot.valid_fields, telemetry::Field::gear) ||
      snapshot.values.gear == 0) {
    text = {'N', '\0'};
    return;
  }
  if (snapshot.values.gear == -1) {
    text = {'R', '\0'};
    return;
  }

  std::snprintf(text.data(), text.size(), "%d",
                static_cast<int>(snapshot.values.gear));
  text.back() = '\0';
}

void render() {
  std::array<char, kTextCapacity> text{};
  format_gear(widget_state.telemetry->snapshot(), text);
  if (widget_state.initialized &&
      std::strncmp(widget_state.text.data(), text.data(), text.size()) == 0) {
    return;
  }

  widget_state.text = text;
  lv_label_set_text_static(widget_state.label, widget_state.text.data());
  lv_obj_invalidate(widget_state.label);
  widget_state.initialized = true;
}

void update(lv_timer_t*) { render(); }

}  // namespace

bool create(const Layout& layout, const Config& config,
            const telemetry::ITelemetryReader& telemetry) {
  if (layout.display == nullptr || !lvgl_port_lock(0)) {
    return false;
  }

  const lv_font_t* const font = fonts::resolve(config.font);
  const std::int32_t content_width =
      static_cast<std::int32_t>(lv_font_get_glyph_width(font, '8', '8'));
  const std::int32_t content_height = lv_font_get_line_height(font);
  const std::int32_t horizontal_insets =
      2 * config.border.width_px + config.padding.left + config.padding.right;
  const std::int32_t vertical_insets =
      2 * config.border.width_px + config.padding.top + config.padding.bottom;

  lv_obj_t* parent{};
  Rect bounds{};
  if (!resolve_widget_bounds(
          layout, config.placement, content_width + horizontal_insets,
          content_height + vertical_insets, false, parent, bounds) ||
      bounds.width <= horizontal_insets || bounds.height <= vertical_insets) {
    lvgl_port_unlock();
    return false;
  }

  lv_obj_t* const container = lv_obj_create(parent);
  lv_obj_remove_style_all(container);
  lv_obj_set_pos(container, bounds.x, bounds.y);
  lv_obj_set_size(container, bounds.width, bounds.height);
  lv_obj_set_style_bg_color(
      container, lv_color_hex(config.background_color_rgb), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(container, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_color(
      container, lv_color_hex(config.border.color_rgb), LV_PART_MAIN);
  lv_obj_set_style_border_width(container, config.border.width_px,
                                LV_PART_MAIN);
  lv_obj_set_style_border_opa(
      container, config.border.width_px == 0 ? LV_OPA_TRANSP : LV_OPA_COVER,
      LV_PART_MAIN);
  lv_obj_set_style_radius(container, config.border.radius_px, LV_PART_MAIN);
  lv_obj_set_style_pad_left(container, config.padding.left, LV_PART_MAIN);
  lv_obj_set_style_pad_top(container, config.padding.top, LV_PART_MAIN);
  lv_obj_set_style_pad_right(container, config.padding.right, LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(container, config.padding.bottom, LV_PART_MAIN);
  lv_obj_remove_flag(container, LV_OBJ_FLAG_SCROLLABLE);
  apply_debug_widget_outline(container);

  widget_state = {
      .telemetry = &telemetry,
      .label = lv_label_create(container),
  };
  lv_obj_remove_style_all(widget_state.label);
  lv_obj_set_style_text_align(widget_state.label, LV_TEXT_ALIGN_CENTER,
                              LV_PART_MAIN);
  lv_obj_set_style_text_font(widget_state.label, font, LV_PART_MAIN);
  lv_obj_set_style_text_color(
      widget_state.label, lv_color_hex(config.text_color_rgb), LV_PART_MAIN);
  lv_obj_center(widget_state.label);

  render();
  lv_timer_create(update, kRenderPeriodMs, nullptr);
  lvgl_port_unlock();
  return true;
}

}  // namespace simcore::dashboard::gear_widget
