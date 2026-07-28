#include "speed_widget.hpp"

#include <array>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>

#include "dashboard_fonts.hpp"
#include "dashboard_layout_internal.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "telemetry_state.hpp"

namespace simcore::dashboard::speed_widget {
namespace {

constexpr std::uint32_t kRenderPeriodMs = 50;
constexpr std::size_t kTextCapacity = 11;
constexpr std::int32_t kCharacterCount = 3;

struct WidgetState {
  const telemetry::ITelemetryReader* telemetry{};
  lv_obj_t* label{};
  std::array<char, kTextCapacity> text{};
  bool initialized{};
};

WidgetState widget_state;

void format_speed(const telemetry::TelemetrySnapshot& snapshot,
                  std::array<char, kTextCapacity>& text) {
  std::uint32_t speed{};
  if (telemetry::contains(snapshot.valid_fields, telemetry::Field::speed)) {
    const float speed_kph = snapshot.values.speed_kph;
    if (speed_kph >=
        static_cast<float>(std::numeric_limits<std::uint32_t>::max())) {
      speed = std::numeric_limits<std::uint32_t>::max();
    } else if (speed_kph > 0.0F) {
      speed = static_cast<std::uint32_t>(speed_kph);
    }
  }
  std::snprintf(text.data(), text.size(), "%lu",
                static_cast<unsigned long>(speed));
  text.back() = '\0';
}

void render() {
  std::array<char, kTextCapacity> text{};
  format_speed(widget_state.telemetry->snapshot(), text);
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
  const std::int32_t character_width =
      static_cast<std::int32_t>(lv_font_get_glyph_width(font, '8', '8'));
  const std::int32_t content_width = character_width * kCharacterCount;
  const std::int32_t content_height = lv_font_get_line_height(font);

  lv_obj_t* parent{};
  Rect bounds{};
  if (!resolve_widget_bounds(layout, config.placement, content_width,
                             content_height, false, parent, bounds)) {
    lvgl_port_unlock();
    return false;
  }

  lv_obj_t* const container = lv_obj_create(parent);
  lv_obj_remove_style_all(container);
  lv_obj_set_pos(container, bounds.x, bounds.y);
  lv_obj_set_size(container, bounds.width, bounds.height);
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

}  // namespace simcore::dashboard::speed_widget
