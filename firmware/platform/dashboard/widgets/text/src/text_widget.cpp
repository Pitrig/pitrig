#include "text_widget.hpp"

#include <algorithm>
#include <array>
#include <charconv>
#include <cstdint>
#include <string_view>
#include <system_error>

#include "dashboard_fonts.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "number_transform.hpp"
#include "simcore_features.hpp"
#include "text_writer.hpp"
#include "time_transform.hpp"
#include "value_text.hpp"
#include "widget_binding.hpp"
#if SIMCORE_DEBUG
#include "performance.hpp"
#endif

namespace simcore::dashboard::text_widget {
namespace {

constexpr char kTag[] = "text_widget";

constexpr std::uint32_t kRenderPeriodMs = LV_DEF_REFR_PERIOD;

[[nodiscard]] std::int32_t text_width_of(const lv_font_t* const font,
                                         const char* const text) {
  lv_point_t size{};
  lv_text_get_size(&size, text, font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
  return size.x;
}

[[nodiscard]] lv_align_t lv_alignment(const Alignment alignment) {
  switch (alignment) {
    case Alignment::top_left:
      return LV_ALIGN_TOP_LEFT;
    case Alignment::top_center:
      return LV_ALIGN_TOP_MID;
    case Alignment::top_right:
      return LV_ALIGN_TOP_RIGHT;
    case Alignment::left:
      return LV_ALIGN_LEFT_MID;
    case Alignment::center:
      return LV_ALIGN_CENTER;
    case Alignment::right:
      return LV_ALIGN_RIGHT_MID;
    case Alignment::bottom_left:
      return LV_ALIGN_BOTTOM_LEFT;
    case Alignment::bottom_center:
      return LV_ALIGN_BOTTOM_MID;
    case Alignment::bottom_right:
      return LV_ALIGN_BOTTOM_RIGHT;
  }
  return LV_ALIGN_CENTER;
}

#if SIMCORE_DISPLAY_RENDER_FULL || SIMCORE_DISPLAY_RENDER_FULL_STRIPS
[[nodiscard]] lv_text_align_t lv_text_alignment(const Alignment alignment) {
  switch (alignment) {
    case Alignment::top_left:
    case Alignment::left:
    case Alignment::bottom_left:
      return LV_TEXT_ALIGN_LEFT;
    case Alignment::top_center:
    case Alignment::center:
    case Alignment::bottom_center:
      return LV_TEXT_ALIGN_CENTER;
    case Alignment::top_right:
    case Alignment::right:
    case Alignment::bottom_right:
      return LV_TEXT_ALIGN_RIGHT;
  }
  return LV_TEXT_ALIGN_CENTER;
}
#endif

void apply_value_color(void* const context, const std::uint32_t rgb) {
  lv_obj_set_style_text_color(static_cast<lv_obj_t*>(context),
                              lv_color_hex(rgb), LV_PART_MAIN);
}

[[nodiscard]] bool complete(const WidgetBinding& binding) {
  if (binding.count == 0 || binding.count > binding.sources.size()) {
    return false;
  }
  for (std::size_t index = 0; index < binding.count; ++index) {
    if (binding.sources[index].read == nullptr ||
        binding.sources[index].read_context == nullptr) {
      return false;
    }
  }
  return true;
}

void source_text_for(
    const configuration::ValueTransform& transform,
    const telemetry::TelemetryRead& value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  if (!value_text::transform_value(transform, value, output)) {
    value_text::placeholder_value(transform, output);
  }
}

void unavailable_text(
    const Config& config,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  if (config.value.unavailable_text.front() != '\0') {
    value_text::copy_text(output, config.value.unavailable_text);
    return;
  }
  transformers::TextWriter writer(output);
  for (std::size_t index = 0; index < config.source_count; ++index) {
    std::array<char, telemetry::kTelemetryTextCapacity> part{};
    value_text::placeholder_value(config.sources[index].transform, part);
    if (!writer.append(transformers::text_view(part))) {
      return;
    }
  }
}

}

bool Collection::build(State& state, const Layout& layout,
                      const Config& config, const WidgetBinding& binding,
                      const fonts::Registry& fonts) {
  const configuration::WidgetFrame& frame = config.frame;
  const lv_font_t* const value_font = fonts.resolve(config.value.font);
  if (value_font == nullptr) {
    return false;
  }
  std::array<char, telemetry::kTelemetryTextCapacity> unavailable{};
  unavailable_text(config, unavailable);
  const std::int32_t value_width = std::max<std::int32_t>(
      text_width_of(value_font, unavailable.data()),
      lv_font_get_glyph_width(value_font, '8', '\0'));
  const std::int32_t value_height = lv_font_get_line_height(value_font);

  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, frame, kTag, value_width, value_height, false, fonts,
                    parent, bounds, box)) {
    return false;
  }
  const std::int32_t title_height = box.caption_height;
  const bool has_title = title_height > 0;

  state.source_count = binding.count;
  for (std::size_t index = 0; index < binding.count; ++index) {
    state.sources[index] = {
        .read = binding.sources[index].read,
        .read_context = binding.sources[index].read_context,
        .transform = config.sources[index].transform,
        .free_running = binding.sources[index].fast_updates,
    };
  }
  state.unavailable_text = unavailable;
  state.container = box.container;

  state.value_label = lv_label_create(state.container);
  lv_obj_remove_style_all(state.value_label);
#if SIMCORE_DISPLAY_RENDER_FULL || SIMCORE_DISPLAY_RENDER_FULL_STRIPS
  lv_label_set_long_mode(state.value_label, LV_LABEL_LONG_MODE_CLIP);
  lv_obj_set_size(state.value_label, lv_pct(100), value_height);
  lv_obj_set_style_text_align(state.value_label,
                              lv_text_alignment(config.value.alignment),
                              LV_PART_MAIN);
#else
  lv_obj_set_size(state.value_label, LV_SIZE_CONTENT, value_height);
#endif
  lv_obj_set_style_text_font(state.value_label, value_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(
      state.value_label, lv_color_hex(config.value.color), LV_PART_MAIN);
  lv_obj_align(state.value_label, lv_alignment(config.value.alignment), 0,
               has_title ? title_height / 4 : 0);

  state.painter.configure(frame, box, config.value.color, &apply_value_color,
                          state.value_label);
  state.painter.bind(binding.condition.read, binding.condition.read_context);
  return true;
}

void Collection::render_state(State& state) {
  const bool first_render = !state.initialized;
  std::array<telemetry::TelemetryRead, kMaximumSources> values{};
  bool changed = first_render;
  bool any_available = false;
#if SIMCORE_DEBUG
  std::int64_t oldest_commit_us = 0;
#endif
  for (std::size_t index = 0; index < state.source_count; ++index) {
    Source& source = state.sources[index];
    values[index] = source.read(source.read_context);
    changed = changed || source.free_running ||
              values[index].revision != source.rendered_revision ||
              values[index].available != source.rendered_available;
#if SIMCORE_DEBUG
    if (values[index].revision != source.rendered_revision &&
        values[index].last_change_us != 0 &&
        (oldest_commit_us == 0 ||
         values[index].last_change_us < oldest_commit_us)) {
      oldest_commit_us = values[index].last_change_us;
    }
#endif
    source.rendered_revision = values[index].revision;
    source.rendered_available = values[index].available;
    any_available = any_available || values[index].available;
  }

  state.painter.render();
  if (!changed) {
    return;
  }

  std::array<char, telemetry::kTelemetryTextCapacity> next{};
  transformers::TextWriter writer(next);
  for (std::size_t index = 0; index < state.source_count; ++index) {
    std::array<char, telemetry::kTelemetryTextCapacity> part{};
    source_text_for(state.sources[index].transform, values[index], part);
    if (!writer.append(transformers::text_view(part))) {
      break;
    }
  }
  state.initialized = true;
  if (!any_available) {
    next = state.unavailable_text;
  }
  if (!first_render && state.displayed_text == next) {
    return;
  }
  state.displayed_text = next;
  lv_label_set_text_static(state.value_label, state.displayed_text.data());
#if SIMCORE_DEBUG
  performance::value_rendered(oldest_commit_us);
#endif
}


bool Collection::create(
    const Layout& layout, const std::span<const Config> configurations,
    const std::span<const WidgetBinding> bindings,
    const fonts::Registry& fonts) {
  if (layout.display == nullptr || configurations.size() != bindings.size()) {
    return false;
  }
  return build_all(bindings.size(), [&](State& state, const std::size_t index) {
    return complete(bindings[index]) &&
           build(state, layout, configurations[index], bindings[index], fonts);
  });
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const WidgetBinding& binding,
                          const fonts::Registry& fonts) {
  if (!complete(binding)) {
    return false;
  }
  return rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, binding, fonts);
  });
}

}
