#include "fuel_widget.hpp"

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

namespace simcore::dashboard::fuel_widget {
namespace {

constexpr std::uint32_t kRenderPeriodMs = 250;
constexpr std::size_t kLevelTextCapacity = 11;
constexpr std::size_t kStatisticTextCapacity = 20;

struct LevelState {
  const telemetry::ITelemetryReader* telemetry{};
  lv_obj_t* label{};
  std::array<char, kLevelTextCapacity> text{};
  bool initialized{};
};

struct StatisticState {
  const telemetry::ITelemetryReader* telemetry{};
  Statistic statistic{};
  lv_obj_t* label{};
  std::array<char, kStatisticTextCapacity> text{};
  bool initialized{};
};

LevelState level_state;
std::array<StatisticState, 2> statistic_states{};

std::size_t statistic_index(const Statistic statistic) {
  return statistic == Statistic::average_consumption ? 0U : 1U;
}

void format_level(const telemetry::TelemetrySnapshot& snapshot,
                  std::array<char, kLevelTextCapacity>& text) {
  if (!telemetry::contains(snapshot.valid_fields, telemetry::Field::fuel)) {
    std::snprintf(text.data(), text.size(), "--");
    return;
  }

  const float liters = snapshot.values.fuel_liters;
  const std::uint32_t rounded_liters =
      liters > 0.0F ? static_cast<std::uint32_t>(liters + 0.5F) : 0U;
  std::snprintf(text.data(), text.size(), "%luL",
                static_cast<unsigned long>(rounded_liters));
  text.back() = '\0';
}

void format_statistic(const StatisticState& state,
                      const telemetry::TelemetrySnapshot& snapshot,
                      std::array<char, kStatisticTextCapacity>& text) {
  const bool average =
      state.statistic == Statistic::average_consumption;
  const telemetry::Field field =
      average ? telemetry::Field::fuel_average_consumption
              : telemetry::Field::fuel_laps_remaining;
  const char* const prefix = average ? "AVG" : "LAPS";
  if (!telemetry::contains(snapshot.valid_fields, field)) {
    std::snprintf(text.data(), text.size(), "%s --", prefix);
    return;
  }

  const float value =
      average ? snapshot.values.fuel_average_liters_per_lap
              : snapshot.values.fuel_laps_remaining;
  const std::uint32_t tenths =
      value > 0.0F ? static_cast<std::uint32_t>(value * 10.0F + 0.5F) : 0U;
  std::snprintf(text.data(), text.size(), "%s %lu.%lu", prefix,
                static_cast<unsigned long>(tenths / 10U),
                static_cast<unsigned long>(tenths % 10U));
  text.back() = '\0';
}

void render_level() {
  std::array<char, kLevelTextCapacity> text{};
  format_level(level_state.telemetry->snapshot(), text);
  if (level_state.initialized &&
      std::strncmp(level_state.text.data(), text.data(), text.size()) == 0) {
    return;
  }

  level_state.text = text;
  lv_label_set_text_static(level_state.label, level_state.text.data());
  lv_obj_invalidate(level_state.label);
  level_state.initialized = true;
}

void render_statistic(StatisticState& state) {
  std::array<char, kStatisticTextCapacity> text{};
  format_statistic(state, state.telemetry->snapshot(), text);
  if (state.initialized &&
      std::strncmp(state.text.data(), text.data(), text.size()) == 0) {
    return;
  }

  state.text = text;
  lv_label_set_text_static(state.label, state.text.data());
  lv_obj_invalidate(state.label);
  state.initialized = true;
}

void update_level(lv_timer_t*) { render_level(); }

void update_statistic(lv_timer_t* timer) {
  auto* const state =
      static_cast<StatisticState*>(lv_timer_get_user_data(timer));
  if (state != nullptr) {
    render_statistic(*state);
  }
}

lv_obj_t* create_container(lv_obj_t* parent, const Rect& bounds) {
  lv_obj_t* const container = lv_obj_create(parent);
  lv_obj_remove_style_all(container);
  lv_obj_set_pos(container, bounds.x, bounds.y);
  lv_obj_set_size(container, bounds.width, bounds.height);
  lv_obj_remove_flag(container, LV_OBJ_FLAG_SCROLLABLE);
  apply_debug_widget_outline(container);
  return container;
}

}  // namespace

bool create_level(const Layout& layout, const LevelConfig& config,
                  const telemetry::ITelemetryReader& telemetry) {
  if (layout.display == nullptr || level_state.label != nullptr ||
      !lvgl_port_lock(0)) {
    return false;
  }

  const lv_font_t* const font = fonts::resolve(config.font);
  const std::int32_t value_width =
      static_cast<std::int32_t>(lv_font_get_glyph_width(font, '8', '8')) * 5;
  const std::int32_t content_height = lv_font_get_line_height(font);

  lv_obj_t* parent{};
  Rect bounds{};
  if (!resolve_widget_bounds(layout, config.placement, value_width,
                             content_height, false, parent, bounds)) {
    lvgl_port_unlock();
    return false;
  }

  lv_obj_t* const container = create_container(parent, bounds);

  level_state = {
      .telemetry = &telemetry,
      .label = lv_label_create(container),
  };
  lv_obj_remove_style_all(level_state.label);
  lv_obj_set_width(level_state.label, bounds.width);
  lv_obj_set_style_text_align(level_state.label, LV_TEXT_ALIGN_CENTER,
                              LV_PART_MAIN);
  lv_obj_set_style_text_font(level_state.label, font, LV_PART_MAIN);
  lv_obj_set_style_text_color(
      level_state.label, lv_color_hex(config.text_color_rgb), LV_PART_MAIN);
  lv_obj_center(level_state.label);

  render_level();
  if (lv_timer_create(update_level, kRenderPeriodMs, nullptr) == nullptr) {
    level_state = {};
    lv_obj_delete(container);
    lvgl_port_unlock();
    return false;
  }

  lvgl_port_unlock();
  return true;
}

bool create_statistic(const Layout& layout, const StatisticConfig& config,
                      const Statistic statistic,
                      const telemetry::ITelemetryReader& telemetry) {
  StatisticState& state = statistic_states[statistic_index(statistic)];
  if (layout.display == nullptr || state.label != nullptr ||
      !lvgl_port_lock(0)) {
    return false;
  }

  const lv_font_t* const font = fonts::resolve(config.font);
  const std::int32_t content_width =
      static_cast<std::int32_t>(lv_font_get_glyph_width(font, '8', '8')) * 10;
  const std::int32_t content_height = lv_font_get_line_height(font);
  lv_obj_t* parent{};
  Rect bounds{};
  if (!resolve_widget_bounds(layout, config.placement, content_width,
                             content_height, false, parent, bounds)) {
    lvgl_port_unlock();
    return false;
  }

  lv_obj_t* const container = create_container(parent, bounds);
  state = {
      .telemetry = &telemetry,
      .statistic = statistic,
      .label = lv_label_create(container),
  };
  lv_obj_remove_style_all(state.label);
  lv_obj_set_width(state.label, bounds.width);
  lv_obj_set_style_text_align(state.label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_set_style_text_font(state.label, font, LV_PART_MAIN);
  lv_obj_set_style_text_color(
      state.label, lv_color_hex(config.text_color_rgb), LV_PART_MAIN);
  lv_obj_center(state.label);

  render_statistic(state);
  if (lv_timer_create(update_statistic, kRenderPeriodMs, &state) == nullptr) {
    state = {};
    lv_obj_delete(container);
    lvgl_port_unlock();
    return false;
  }

  lvgl_port_unlock();
  return true;
}

}  // namespace simcore::dashboard::fuel_widget
