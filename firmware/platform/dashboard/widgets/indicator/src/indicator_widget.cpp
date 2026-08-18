#include "indicator_widget.hpp"

#include <algorithm>

#include "esp_lvgl_port.h"
#include "logger.hpp"
#include "lvgl.h"
#include "widget_conditions.hpp"

namespace simcore::dashboard::indicator_widget {
namespace {

constexpr char kTag[] = "indicator_widget";

void paint_segment(lv_obj_t* const segment, const std::uint32_t rgb,
                   const bool visible) {
  lv_obj_set_style_bg_color(segment, lv_color_hex(rgb), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(segment, visible ? LV_OPA_COVER : LV_OPA_TRANSP,
                          LV_PART_MAIN);
}

}  // namespace

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const frame::ValueBinding& binding,
                       const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  // A strip has no intrinsic size: the placement is the whole of it.
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.read = binding.read;
  state.read_context = binding.read_context;
  state.range = config.range;
  state.segment_count = config.segment_count;
  state.off_color = config.off_color;
  state.has_off_color = config.off_color != configuration::kTransparentColor;
  state.blink_threshold = config.blink_threshold;
  state.blink_ms = config.blink_ms;
  state.free_running = binding.fast_updates;
  for (std::size_t index = 0; index < state.segment_count; ++index) {
    state.thresholds[index] = config.segments[index].threshold;
    state.colors[index] = config.segments[index].color;
  }

  const std::int32_t border = config.frame.border.width_px;
  const std::int32_t inner_width = std::max<std::int32_t>(
      bounds.width - 2 * border - config.frame.padding.left -
          config.frame.padding.right,
      0);
  const std::int32_t inner_height = std::max<std::int32_t>(
      bounds.height - 2 * border - config.frame.padding.top -
          config.frame.padding.bottom,
      0);
  const bool horizontal =
      config.orientation == configuration::BarOrientation::horizontal;
  const std::int32_t span = horizontal ? inner_width : inner_height;
  const auto count = static_cast<std::int32_t>(state.segment_count);
  const std::int32_t gaps = config.segment_gap_px * (count - 1);
  const std::int32_t length = (span - gaps) / std::max<std::int32_t>(count, 1);
  if (length <= 0) {
    log::error(kTag, "Indicator needs %d segments in %d pixels",
               static_cast<int>(count), static_cast<int>(span));
    return false;
  }

  for (std::size_t index = 0; index < state.segment_count; ++index) {
    lv_obj_t* const segment = lv_obj_create(box.container);
    lv_obj_remove_style_all(segment);
    lv_obj_remove_flag(segment, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(segment, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_radius(segment, config.segment_radius_px, LV_PART_MAIN);
    const auto offset =
        static_cast<std::int32_t>(index) * (length + config.segment_gap_px);
    if (horizontal) {
      lv_obj_set_pos(segment, offset, 0);
      lv_obj_set_size(segment, length, inner_height);
    } else {
      // A vertical strip lights from the bottom up, the way a rev ladder reads.
      lv_obj_set_pos(segment, 0, inner_height - offset - length);
      lv_obj_set_size(segment, inner_width, length);
    }
    paint_segment(segment, state.off_color, state.has_off_color);
    state.segments[index] = segment;
  }
  state.drawn_mask = 0;
  state.drawn_blink_visible = true;

  // The strip's colours are its segments' own, so a rule paints the frame
  // rather than the lamps: two mechanisms deciding one colour is exactly what
  // the conditional styling decision set out to avoid.
  state.painter.configure(config.frame, box, state.colors[0], nullptr, nullptr);
  state.painter.bind(binding.condition_read, binding.condition_context);
  return true;
}

bool Collection::create(const Layout& layout,
                        const std::span<const Config> configurations,
                        const std::span<const frame::ValueBinding> bindings,
                        const fonts::Registry& fonts) {
  if (layout.display == nullptr || configurations.size() != bindings.size()) {
    return false;
  }
  return build_all(bindings.size(), [&](State& state, const std::size_t index) {
    return bindings[index].read != nullptr &&
           bindings[index].read_context != nullptr &&
           build(state, layout, configurations[index], bindings[index], fonts);
  });
}

void Collection::render_state(State& state) {
  const telemetry::TelemetryRead value = state.read(state.read_context);
  const bool first_render = !state.initialized;
  const bool changed = first_render || state.free_running ||
                       value.revision != state.rendered_revision ||
                       value.available != state.rendered_available;
  state.rendered_revision = value.revision;
  state.rendered_available = value.available;
  state.painter.render();
  state.initialized = true;

  // An unavailable source reads as empty rather than holding its last lamps.
  const std::optional<double> numeric = conditions::condition_value(value);
  const float fraction =
      numeric.has_value() ? conditions::range_fraction(*numeric, state.range)
                          : 0.0F;

  // Thresholds are non-decreasing, so the lit segments are a prefix and the
  // first one not reached ends the strip.
  std::uint32_t mask{};
  for (std::size_t index = 0; index < state.segment_count; ++index) {
    if (fraction < state.thresholds[index]) {
      break;
    }
    mask |= 1U << index;
  }

  const bool blinking = state.blink_ms > 0 && fraction >= state.blink_threshold;
  const bool blink_visible =
      !blinking || (lv_tick_get() / state.blink_ms) % 2 == 0;
  // The blink phase advances on its own, so this cannot return early on an
  // unchanged value the way a static widget can.
  if (!first_render && !changed && !blinking) {
    return;
  }
  if (!first_render && mask == state.drawn_mask &&
      blink_visible == state.drawn_blink_visible) {
    return;
  }

  for (std::size_t index = 0; index < state.segment_count; ++index) {
    const bool lit = (mask & (1U << index)) != 0 && blink_visible;
    const bool was_lit = (state.drawn_mask & (1U << index)) != 0 &&
                         state.drawn_blink_visible;
    if (!first_render && lit == was_lit) {
      continue;
    }
    paint_segment(state.segments[index], lit ? state.colors[index] : state.off_color,
                  lit || state.has_off_color);
  }
  state.drawn_mask = mask;
  state.drawn_blink_visible = blink_visible;
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const frame::ValueBinding& binding,
                          const fonts::Registry& fonts) {
  if (binding.read == nullptr || binding.read_context == nullptr) {
    return false;
  }
  return rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, binding, fonts);
  });
}

}  // namespace simcore::dashboard::indicator_widget
