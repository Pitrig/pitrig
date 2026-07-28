#include "driving_aid_widget.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <cstring>

#include "dashboard_fonts.hpp"
#include "dashboard_layout_internal.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "telemetry_state.hpp"

namespace simcore::dashboard::driving_aid_widget {
namespace {

constexpr std::uint32_t kRenderPeriodMs = 50;
constexpr std::size_t kTextCapacity = 8;
constexpr std::size_t kWidgetCount = 3;

struct WidgetState {
  const telemetry::ITelemetryReader* telemetry{};
  Kind kind{};
  lv_obj_t* value_label{};
  std::array<char, kTextCapacity> text{};
  bool initialized{};
};

std::array<WidgetState, kWidgetCount> widget_states;

[[nodiscard]] constexpr std::size_t state_index(const Kind kind) {
  switch (kind) {
    case Kind::traction_control:
      return 0;
    case Kind::abs:
      return 1;
    case Kind::brake_bias:
      return 2;
  }
  return kWidgetCount;
}

[[nodiscard]] constexpr const char* label_text(const Kind kind) {
  switch (kind) {
    case Kind::traction_control:
      return "TC";
    case Kind::abs:
      return "ABS";
    case Kind::brake_bias:
      return "BIAS";
  }
  return "";
}

[[nodiscard]] constexpr std::int32_t maximum_value_characters(
    const Kind kind) {
  return kind == Kind::brake_bias ? 5 : 3;
}

[[nodiscard]] std::int32_t text_width(const lv_font_t* const font,
                                      const char* const text) {
  std::int32_t width{};
  for (std::size_t index = 0; text[index] != '\0'; ++index) {
    const char next = text[index + 1];
    width += static_cast<std::int32_t>(
        lv_font_get_glyph_width(font, text[index], next));
  }
  return width;
}

void format_value(const WidgetState& state,
                  std::array<char, kTextCapacity>& text) {
  const telemetry::TelemetrySnapshot snapshot = state.telemetry->snapshot();
  telemetry::Field field{};
  switch (state.kind) {
    case Kind::traction_control:
      field = telemetry::Field::traction_control;
      break;
    case Kind::abs:
      field = telemetry::Field::abs;
      break;
    case Kind::brake_bias:
      field = telemetry::Field::brake_bias;
      break;
  }

  if (!telemetry::contains(snapshot.valid_fields, field)) {
    text = {'-', '-', '\0'};
    return;
  }

  switch (state.kind) {
    case Kind::traction_control:
      std::snprintf(text.data(), text.size(), "%u",
                    static_cast<unsigned int>(
                        snapshot.values.traction_control_level));
      break;
    case Kind::abs:
      std::snprintf(text.data(), text.size(), "%u",
                    static_cast<unsigned int>(snapshot.values.abs_level));
      break;
    case Kind::brake_bias: {
      const std::uint16_t value =
          snapshot.values.brake_bias_tenths_percent;
      std::snprintf(text.data(), text.size(), "%u.%u",
                    static_cast<unsigned int>(value / 10U),
                    static_cast<unsigned int>(value % 10U));
      break;
    }
  }
  text.back() = '\0';
}

void render(WidgetState& state) {
  std::array<char, kTextCapacity> text{};
  format_value(state, text);
  if (state.initialized &&
      std::strncmp(state.text.data(), text.data(), text.size()) == 0) {
    return;
  }

  state.text = text;
  lv_label_set_text_static(state.value_label, state.text.data());
  lv_obj_invalidate(state.value_label);
  state.initialized = true;
}

void update(lv_timer_t* const timer) {
  auto* const state =
      static_cast<WidgetState*>(lv_timer_get_user_data(timer));
  if (state != nullptr) {
    render(*state);
  }
}

}  // namespace

bool create(const Layout& layout, const Config& config, const Kind kind,
            const telemetry::ITelemetryReader& telemetry) {
  const std::size_t index = state_index(kind);
  if (layout.display == nullptr || index >= widget_states.size() ||
      widget_states[index].value_label != nullptr || !lvgl_port_lock(0)) {
    return false;
  }

  const lv_font_t* const label_font = fonts::resolve(config.label_font);
  const lv_font_t* const value_font = fonts::resolve(config.value_font);
  const std::int32_t label_height = lv_font_get_line_height(label_font);
  const std::int32_t label_width =
      text_width(label_font, label_text(kind));
  const std::int32_t value_height = lv_font_get_line_height(value_font);
  const std::int32_t value_character_width =
      static_cast<std::int32_t>(
          lv_font_get_glyph_width(value_font, '8', '8'));
  const std::int32_t horizontal_insets =
      2 * config.border.width_px + config.padding.left + config.padding.right;
  const std::int32_t vertical_insets =
      2 * config.border.width_px + config.padding.top + config.padding.bottom;
  const std::int32_t content_width = std::max(
      label_width + 4,
      value_character_width * maximum_value_characters(kind));
  const std::int32_t content_height = value_height + label_height / 2;

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
  lv_obj_remove_flag(container, LV_OBJ_FLAG_CLICKABLE);
  apply_debug_widget_outline(container);

  const std::int32_t caption_gap_width = label_width + 8;
  lv_obj_t* const caption_gap = lv_obj_create(parent);
  lv_obj_remove_style_all(caption_gap);
  lv_obj_set_size(
      caption_gap, caption_gap_width,
      std::max<std::int32_t>(config.border.width_px + 2, 1));
  lv_obj_set_pos(caption_gap,
                 bounds.x + (bounds.width - caption_gap_width) / 2,
                 bounds.y);
  lv_obj_set_style_bg_color(
      caption_gap, lv_color_hex(config.background_color_rgb), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(caption_gap, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_remove_flag(caption_gap, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(caption_gap, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_t* const caption = lv_label_create(parent);
  lv_obj_remove_style_all(caption);
  lv_label_set_text_static(caption, label_text(kind));
  lv_obj_set_style_text_font(caption, label_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(
      caption, lv_color_hex(config.label_color_rgb), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(caption, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_pos(caption, bounds.x + (bounds.width - label_width) / 2,
                 bounds.y - label_height / 2 +
                     config.label_offset_y_px);

  WidgetState& state = widget_states[index];
  state = {
      .telemetry = &telemetry,
      .kind = kind,
      .value_label = lv_label_create(container),
  };
  lv_obj_remove_style_all(state.value_label);
  lv_obj_set_style_text_align(state.value_label, LV_TEXT_ALIGN_CENTER,
                              LV_PART_MAIN);
  lv_obj_set_style_text_font(state.value_label, value_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(
      state.value_label, lv_color_hex(config.value_color_rgb), LV_PART_MAIN);
  lv_obj_align(state.value_label, LV_ALIGN_CENTER, 0, label_height / 4);

  render(state);
  if (lv_timer_create(update, kRenderPeriodMs, &state) == nullptr) {
    state = {};
    lv_obj_delete(caption);
    lv_obj_delete(caption_gap);
    lv_obj_delete(container);
    lvgl_port_unlock();
    return false;
  }

  lvgl_port_unlock();
  return true;
}

}  // namespace simcore::dashboard::driving_aid_widget
