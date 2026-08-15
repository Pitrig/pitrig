#include "text_widget.hpp"

#include <algorithm>
#include <array>
#include <charconv>
#include <cstdint>
#include <system_error>

#include "dashboard_fonts.hpp"
#include "dashboard_layout_internal.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "time_transform.hpp"
#include "widget_binding.hpp"

namespace simcore::dashboard::text_widget {
namespace {

// Widgets follow the display refresh cadence instead of a slower dedicated
// period: a telemetry-backed widget whose source slot did not advance skips the
// read-transform-format-compare work entirely, so an idle dashboard costs one
// revision comparison per widget per period.
constexpr std::uint32_t kRenderPeriodMs = LV_DEF_REFR_PERIOD;

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

[[nodiscard]] bool source_text(
    const telemetry::TelemetryRead& value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  if (!value.available) {
    return false;
  }
  if (value.value.source_text.front() != '\0' ||
      value.handle.type == telemetry::ValueType::text) {
    output = value.value.source_text;
    return true;
  }
  if (value.handle.type == telemetry::ValueType::boolean) {
    constexpr std::array<char, 6> kTrue{'t', 'r', 'u', 'e', '\0', '\0'};
    constexpr std::array<char, 6> kFalse{'f', 'a', 'l', 's', 'e', '\0'};
    copy_text(output,
              value.value.typed.boolean_value ? kTrue : kFalse);
    return true;
  }
  std::to_chars_result result{};
  switch (value.handle.type) {
    case telemetry::ValueType::uint32:
      result = std::to_chars(output.data(), output.data() + output.size() - 1,
                             value.value.typed.uint32_value);
      break;
    case telemetry::ValueType::int32:
      result = std::to_chars(output.data(), output.data() + output.size() - 1,
                             value.value.typed.int32_value);
      break;
    case telemetry::ValueType::float32:
      result = std::to_chars(output.data(), output.data() + output.size() - 1,
                             value.value.typed.float32_value);
      break;
    case telemetry::ValueType::text:
    case telemetry::ValueType::boolean:
      return false;
  }
  if (result.ec != std::errc{}) {
    return false;
  }
  *result.ptr = '\0';
  return true;
}

[[nodiscard]] bool transform_value(
    const configuration::ValueTransform& transform,
    const telemetry::TelemetryRead& value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  if (!value.available) {
    return false;
  }
  if (transform.type == configuration::ValueTransformType::none) {
    return source_text(value, output);
  }
  if (transform.type != configuration::ValueTransformType::time) {
    return false;
  }
  if (value.handle.type == telemetry::ValueType::uint32) {
    return transformers::time_transform::apply(
        transform.time, value.value.typed.uint32_value, output);
  }
  if (value.handle.type == telemetry::ValueType::int32) {
    return transformers::time_transform::apply(
        transform.time, value.value.typed.int32_value, output);
  }
  return false;
}

}  // namespace

Collection::~Collection() { destroy(); }

void Collection::destroy() {
  if (!created_ || !lvgl_port_lock(0)) {
    return;
  }
  clear_objects();
  lvgl_port_unlock();
}

// Builds the LVGL objects for one widget into an already-cleared state.
// Callers hold the LVGL lock. On failure the state is left partially built
// and the caller must release it.
bool Collection::build(State& state, const Layout& layout,
                      const Config& config, const BoundConfig& binding,
                      const fonts::Registry& fonts) {
    const bool has_title = config.title.text.front() != '\0';
  const lv_font_t* const title_font =
      has_title ? fonts.resolve(config.title.font) : nullptr;
  const lv_font_t* const value_font = fonts.resolve(config.value.font);
  if ((has_title && title_font == nullptr) || value_font == nullptr) {
    return false;
  }
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
    return false;
  }

  state.read = binding.read;
  state.read_context = binding.read_context;
  state.transform = config.transform;
  state.free_running = binding.fast_updates;
  copy_text(state.unavailable_text, config.value.unavailable_text);
  copy_text(state.title_text, config.title.text);
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
    lv_label_set_text_static(state.caption, state.title_text.data());
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
  return true;
}

bool Collection::create(
    const Layout& layout, const std::span<const Config> configurations,
    const std::span<const BoundConfig> bindings,
    const fonts::Registry& fonts) {
  if (layout.display == nullptr || bindings.size() > states_.size() ||
      configurations.size() != bindings.size() || created_ ||
      !lvgl_port_lock(0)) {
    return false;
  }

  created_ = true;
  for (std::size_t widget = 0; widget < bindings.size(); ++widget) {
    const BoundConfig& binding = bindings[widget];
    if (binding.read == nullptr || binding.read_context == nullptr ||
        !build(states_[count_], layout, configurations[widget], binding,
               fonts)) {
      clear_objects();
      created_ = false;
      lvgl_port_unlock();
      return false;
    }
    ++count_;
  }

  render();
  if (count_ > 0) {
    timer_ = lv_timer_create(update, kRenderPeriodMs, this);
    if (timer_ == nullptr) {
      clear_objects();
      created_ = false;
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

void Collection::render_state(State& state) {
  const telemetry::TelemetryRead value = state.read(state.read_context);
  // A telemetry slot advances its revision only when the stored value really
  // changed, so an unchanged slot needs no transform, formatting, or compare.
  // Free-running module sources report no revision and always re-render.
  const bool first_render = !state.initialized;
  if (!first_render && !state.free_running &&
      value.revision == state.rendered_revision &&
      value.available == state.rendered_available) {
    return;
  }
  state.rendered_revision = value.revision;
  state.rendered_available = value.available;
  state.initialized = true;

  std::array<char, telemetry::kTelemetryTextCapacity> next{};
  if (!transform_value(state.transform, value, next)) {
    next = state.unavailable_text;
  }
  // A changed source can still transform to the same text, so keep the
  // comparison before touching LVGL.
  if (!first_render && state.displayed_text == next) {
    return;
  }
  state.displayed_text = next;
  // lv_label_set_text_static() marks the label for refresh and invalidates it.
  lv_label_set_text_static(state.value_label, state.displayed_text.data());
}

void Collection::render() {
  if (!created_) {
    return;
  }
  for (std::size_t index = 0; index < count_; ++index) {
    render_state(states_[index]);
  }
}

void Collection::release(State& state) {
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

void Collection::clear_objects() {
  if (timer_ != nullptr) {
    lv_timer_delete(timer_);
    timer_ = nullptr;
  }
  for (std::size_t index = 0; index < count_; ++index) {
    release(states_[index]);
  }
  count_ = 0;
  created_ = false;
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const BoundConfig& binding,
                          const fonts::Registry& fonts) {
  if (!created_ || index >= count_ || binding.read == nullptr ||
      binding.read_context == nullptr || !lvgl_port_lock(0)) {
    return false;
  }
  State& state = states_[index];
  release(state);
  const bool built = build(state, layout, configuration, binding, fonts);
  if (built) {
    // A fresh lv_label carries LVGL's placeholder text until something sets it.
    // Rendering before the lock is released keeps that from reaching the
    // display between a rebuild and the next timer tick.
    render_state(state);
  } else {
    release(state);
  }
  lvgl_port_unlock();
  return built;
}

}  // namespace simcore::dashboard::text_widget
