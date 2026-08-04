#include "text_widget.hpp"

#include <algorithm>
#include <array>
#include <cstdint>

#include "dashboard_fonts.hpp"
#include "dashboard_layout_internal.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "telemetry_state.hpp"
#include "widget_binding.hpp"

namespace simcore::dashboard::text_widget {
namespace {

constexpr std::uint32_t kRenderPeriodMs = 50;

[[nodiscard]] std::int32_t text_width(const lv_font_t* const font,
                                      const char* const text) {
  lv_point_t size{};
  lv_text_get_size(&size, text, font, 0, 0, LV_COORD_MAX,
                   LV_TEXT_FLAG_NONE);
  return size.x;
}

[[nodiscard]] lv_text_align_t lv_alignment(const Alignment alignment) {
  switch (alignment) {
    case Alignment::left:
      return LV_TEXT_ALIGN_LEFT;
    case Alignment::center:
      return LV_TEXT_ALIGN_CENTER;
    case Alignment::right:
      return LV_TEXT_ALIGN_RIGHT;
  }
  return LV_TEXT_ALIGN_CENTER;
}

[[nodiscard]] lv_color_t background_behind(const lv_obj_t* object) {
  while (object != nullptr) {
    if (lv_obj_get_style_bg_opa(object, LV_PART_MAIN) > LV_OPA_TRANSP) {
      return lv_obj_get_style_bg_color(object, LV_PART_MAIN);
    }
    object = lv_obj_get_parent(object);
  }
  return lv_color_black();
}

template <std::size_t DestinationSize, std::size_t SourceSize>
void copy_text(std::array<char, DestinationSize>& destination,
               const std::array<char, SourceSize>& source) {
  destination.fill('\0');
  const auto terminator = std::find(source.begin(), source.end(), '\0');
  const std::size_t source_length =
      static_cast<std::size_t>(std::distance(source.begin(), terminator));
  const std::size_t length = std::min(DestinationSize - 1, source_length);
  std::copy_n(source.begin(), length, destination.begin());
}

}  // namespace

bool Collection::create(
    const Layout& layout,
    const std::span<const BoundConfig> configurations,
    const telemetry::ITelemetryReader& telemetry,
    const fonts::Registry& fonts) {
  if (layout.display == nullptr ||
      configurations.size() > states_.size() || telemetry_ != nullptr ||
      !lvgl_port_lock(0)) {
    return false;
  }

  telemetry_ = &telemetry;
  for (const BoundConfig& binding : configurations) {
    if (binding.configuration == nullptr || !binding.handle.valid()) {
      clear_objects();
      telemetry_ = nullptr;
      lvgl_port_unlock();
      return false;
    }
    const Config& config = *binding.configuration;
    const lv_font_t* const title_font = fonts.resolve(config.title.font);
    const lv_font_t* const value_font = fonts.resolve(config.value.font);
    if (title_font == nullptr || value_font == nullptr) {
      clear_objects();
      telemetry_ = nullptr;
      lvgl_port_unlock();
      return false;
    }
    const bool has_title = config.title.text.front() != '\0';
    const std::int32_t title_width =
        has_title ? text_width(title_font, config.title.text.data()) : 0;
    const std::int32_t title_height =
        has_title ? lv_font_get_line_height(title_font) : 0;
    const std::int32_t value_width =
        std::max<std::int32_t>(
            text_width(value_font, config.value.unavailable_text.data()),
            lv_font_get_glyph_width(value_font, '8', '\0'));
    const std::int32_t value_height = lv_font_get_line_height(value_font);
    const std::int32_t horizontal_insets =
        2 * config.border.width_px + config.padding.left +
        config.padding.right;
    const std::int32_t vertical_insets =
        2 * config.border.width_px + config.padding.top +
        config.padding.bottom;
    const std::int32_t content_width =
        std::max(value_width, title_width + (has_title ? 8 : 0));
    const std::int32_t content_height =
        value_height + (has_title ? title_height / 2 : 0);

    lv_obj_t* parent{};
    Rect bounds{};
    if (!resolve_widget_bounds(
            layout, config.placement, content_width + horizontal_insets,
            content_height + vertical_insets, false, parent, bounds) ||
        bounds.width <= horizontal_insets ||
        bounds.height <= vertical_insets) {
      clear_objects();
      lvgl_port_unlock();
      return false;
    }

    State& state = states_[count_];
    state.binding = binding.handle;
    copy_text(state.unavailable_text, config.value.unavailable_text);
    state.container = lv_obj_create(parent);
    lv_obj_remove_style_all(state.container);
    lv_obj_set_pos(state.container, bounds.x, bounds.y);
    lv_obj_set_size(state.container, bounds.width, bounds.height);
    const bool has_background =
        config.background_color != kTransparentColor;
    if (has_background) {
      lv_obj_set_style_bg_color(
          state.container, lv_color_hex(config.background_color),
          LV_PART_MAIN);
    }
    lv_obj_set_style_bg_opa(
        state.container,
        has_background ? LV_OPA_COVER : LV_OPA_TRANSP,
        LV_PART_MAIN);
    lv_obj_set_style_border_color(
        state.container, lv_color_hex(config.border.color), LV_PART_MAIN);
    lv_obj_set_style_border_width(state.container, config.border.width_px,
                                  LV_PART_MAIN);
    lv_obj_set_style_border_opa(
        state.container,
        config.border.width_px == 0 ? LV_OPA_TRANSP : LV_OPA_COVER,
        LV_PART_MAIN);
    lv_obj_set_style_radius(state.container, config.border.radius_px,
                            LV_PART_MAIN);
    lv_obj_set_style_pad_left(state.container, config.padding.left,
                              LV_PART_MAIN);
    lv_obj_set_style_pad_top(state.container, config.padding.top, LV_PART_MAIN);
    lv_obj_set_style_pad_right(state.container, config.padding.right,
                               LV_PART_MAIN);
    lv_obj_set_style_pad_bottom(state.container, config.padding.bottom,
                                LV_PART_MAIN);
    lv_obj_remove_flag(state.container, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(state.container, LV_OBJ_FLAG_CLICKABLE);
    apply_debug_widget_outline(state.container);

    if (has_title) {
      if (config.border.width_px > 0) {
        state.caption_gap = lv_obj_create(parent);
        lv_obj_remove_style_all(state.caption_gap);
        lv_obj_set_size(state.caption_gap, title_width + 8,
                        config.border.width_px + 2);
        lv_obj_set_pos(state.caption_gap,
                       bounds.x + (bounds.width - title_width - 8) / 2,
                       bounds.y);
        lv_obj_set_style_bg_color(
            state.caption_gap,
            has_background ? lv_color_hex(config.background_color)
                           : background_behind(parent),
            LV_PART_MAIN);
        lv_obj_set_style_bg_opa(state.caption_gap, LV_OPA_COVER, LV_PART_MAIN);
        lv_obj_remove_flag(state.caption_gap, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_remove_flag(state.caption_gap, LV_OBJ_FLAG_CLICKABLE);
      }

      state.caption = lv_label_create(parent);
      lv_obj_remove_style_all(state.caption);
      lv_label_set_text_static(state.caption, config.title.text.data());
      lv_obj_set_style_text_font(state.caption, title_font, LV_PART_MAIN);
      lv_obj_set_style_text_color(
          state.caption, lv_color_hex(config.title.color), LV_PART_MAIN);
      lv_obj_set_pos(state.caption,
                     bounds.x + (bounds.width - title_width) / 2,
                     bounds.y - title_height / 2 +
                         config.title.offset_y_px);
    }

    state.value_label = lv_label_create(state.container);
    lv_obj_remove_style_all(state.value_label);
    lv_obj_set_size(state.value_label,
                    bounds.width - horizontal_insets, value_height);
    lv_obj_set_style_text_align(
        state.value_label, lv_alignment(config.value.alignment), LV_PART_MAIN);
    lv_obj_set_style_text_font(state.value_label, value_font, LV_PART_MAIN);
    lv_obj_set_style_text_color(
        state.value_label, lv_color_hex(config.value.color), LV_PART_MAIN);
    lv_obj_align(state.value_label, LV_ALIGN_CENTER, 0,
                 has_title ? title_height / 4 : 0);
    ++count_;
  }

  render();
  if (count_ > 0) {
    timer_ = lv_timer_create(update, kRenderPeriodMs, this);
    if (timer_ == nullptr) {
      clear_objects();
      telemetry_ = nullptr;
      lvgl_port_unlock();
      return false;
    }
  }

  lvgl_port_unlock();
  return true;
}

void Collection::update(lv_timer_t* const timer) {
  auto* const collection =
      static_cast<Collection*>(lv_timer_get_user_data(timer));
  if (collection != nullptr) {
    collection->render();
  }
}

void Collection::render() {
  if (telemetry_ == nullptr) {
    return;
  }
  for (std::size_t index = 0; index < count_; ++index) {
    State& state = states_[index];
    std::array<char, telemetry::kTelemetryTextCapacity> next{};
    const telemetry::TelemetryRead value = telemetry_->read(state.binding);
    if (value.available) {
      next = value.value.source_text;
    } else {
      next = state.unavailable_text;
    }

    if (state.initialized && state.displayed_text == next) {
      continue;
    }
    state.displayed_text = next;
    lv_label_set_text_static(state.value_label,
                             state.displayed_text.data());
    lv_obj_invalidate(state.value_label);
    state.initialized = true;
  }
}

void Collection::clear_objects() {
  if (timer_ != nullptr) {
    lv_timer_delete(timer_);
    timer_ = nullptr;
  }
  for (std::size_t index = 0; index < count_; ++index) {
    State& state = states_[index];
    if (state.caption != nullptr) {
      lv_obj_delete(state.caption);
    }
    if (state.caption_gap != nullptr) {
      lv_obj_delete(state.caption_gap);
    }
    if (state.container != nullptr) {
      lv_obj_delete(state.container);
    }
    state = {};
  }
  count_ = 0;
}

}  // namespace simcore::dashboard::text_widget
