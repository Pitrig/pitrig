#include "indicator_widget.hpp"

#include <algorithm>

#include "indicator_geometry.hpp"
#include "logger.hpp"
#include "lvgl.h"
#include "value_conditions.hpp"
#include "widget_inner_box.hpp"

namespace pitrig::dashboard::indicator_widget {
namespace {

constexpr char kTag[] = "indicator_widget";

[[nodiscard]] bool overlaps(const lv_area_t& area, const lv_area_t& clip) {
  return area.x1 <= clip.x2 && area.x2 >= clip.x1 && area.y1 <= clip.y2 && area.y2 >= clip.y1;
}

[[nodiscard]] bool lamp_lit(const State& state, const std::uint32_t mask, const bool blink_visible,
                            const std::size_t index) {
  return (mask & (1U << index)) != 0 && blink_visible;
}

void draw_lamps(lv_event_t* const event) {
  auto* const state = static_cast<State*>(lv_event_get_user_data(event));
  lv_layer_t* const layer = lv_event_get_layer(event);
  if (state == nullptr || layer == nullptr || state->container == nullptr) {
    return;
  }
  lv_area_t content{};
  lv_obj_get_content_coords(state->container, &content);
  lv_draw_rect_dsc_t rect{};
  lv_draw_arc_dsc_t arc{};
  if (state->arc_shape) {
    lv_draw_arc_dsc_init(&arc);
    arc.opa = LV_OPA_COVER;
    arc.width = state->thickness;
    arc.rounded = state->rounded ? 1U : 0U;
    arc.center = {content.x1 + state->ring_center_x, content.y1 + state->ring_center_y};
    arc.radius = geometry::outer_radius(*state);
  } else {
    lv_draw_rect_dsc_init(&rect);
    rect.bg_opa = LV_OPA_COVER;
    rect.radius = state->lamp_radius;
  }
  for (std::size_t index = 0; index < state->segment_count; ++index) {
    const bool lit = lamp_lit(*state, state->drawn_mask, state->drawn_blink_visible, index);
    if (!lit && !state->has_off_color) {
      continue;
    }
    const std::uint32_t rgb = lit ? state->colors[index] : state->off_color;
    if (state->arc_shape) {
      const lv_area_t area = geometry::lamp_arc_area(*state, index, content);
      if (!overlaps(area, layer->_clip_area)) {
        continue;
      }
      const std::int32_t start = geometry::lamp_start_deg(*state, index);
      arc.color = lv_color_hex(rgb);
      arc.start_angle = static_cast<lv_value_precise_t>(start);
      arc.end_angle = static_cast<lv_value_precise_t>(start + state->arc_length_deg);
      lv_draw_arc(layer, &arc);
    } else {
      const lv_area_t area = geometry::lamp_area(*state, index, content);
      if (!overlaps(area, layer->_clip_area)) {
        continue;
      }
      rect.bg_color = lv_color_hex(rgb);
      lv_draw_rect(layer, &rect, &area);
    }
  }
}

}

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const frame::ValueBinding& binding, const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent, bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.read = binding.read;
  state.read_context = binding.read_context;
  state.range = config.range;
  state.segment_count = std::min<std::size_t>(config.segment_count, state.colors.size());
  state.off_color = config.off_color;
  state.has_off_color = config.off_color != configuration::kTransparentColor;
  state.blink_threshold = config.blink_threshold;
  state.blink_ms = config.blink_ms;
  state.free_running = binding.fast_updates;
  state.inverted = config.inverted;
  state.lamp_radius = config.segment_radius_px;
  state.thickness = config.thickness_px;
  state.rounded = config.segment_radius_px != 0;
  for (std::size_t index = 0; index < state.segment_count; ++index) {
    state.thresholds[index] = config.segments[index].threshold;
    state.colors[index] = config.segments[index].color;
  }

  const InnerBox inner = inner_box(config.frame, bounds);
  state.horizontal = config.orientation == configuration::BarOrientation::horizontal;
  const auto count = static_cast<std::int32_t>(state.segment_count);
  state.arc_shape = config.shape == configuration::IndicatorShape::arc;

  if (state.arc_shape) {
    const geometry::Ring ring = geometry::resolve_ring(config, inner.width, inner.height);
    state.ring_radius = ring.radius;
    state.ring_center_x = ring.centre_x;
    state.ring_center_y = ring.centre_y;
    const geometry::ArcSlices slices = geometry::resolve_arc(config, ring.radius, count);
    state.arc_start_deg = slices.start_deg;
    state.arc_length_deg = slices.length_deg;
    state.arc_gap_deg = slices.gap_deg;
    if (state.arc_length_deg <= 0) {
      log::error(kTag, "Indicator needs %d segments in %d degrees", static_cast<int>(count),
                 static_cast<int>(config.sector_deg));
      return false;
    }
  } else {
    const std::int32_t span = state.horizontal ? inner.width : inner.height;
    state.lamp_gap = config.segment_gap_px;
    const std::int32_t gaps = state.lamp_gap * (count - 1);
    state.lamp_length = (span - gaps) / std::max<std::int32_t>(count, 1);
    if (state.lamp_length <= 0) {
      log::error(kTag, "Indicator needs %d segments in %d pixels", static_cast<int>(count),
                 static_cast<int>(span));
      return false;
    }
  }
  state.drawn_mask = 0;
  state.drawn_blink_visible = true;
  lv_obj_add_event_cb(state.container, &draw_lamps, LV_EVENT_DRAW_MAIN_END, &state);

  state.painter.configure(config.frame, box, state.colors[0], nullptr, nullptr);
  state.painter.bind(binding.condition_read, binding.condition_context);
  state.painter.bind_caption(binding.caption_read, binding.caption_context);
  return true;
}

void Collection::render_state(State& state) {
  const ValueUpdate update = take_value(state);
  state.painter.render();
  if (!update.changed && !state.drawn_blinking) {
    return;
  }
  state.initialized = true;

  const std::optional<double> numeric = conditions::condition_value(update.value);
  const float fraction =
      conditions::range_fraction(numeric.has_value() ? *numeric : 0.0, state.range);

  std::uint32_t mask{};
  for (std::size_t index = 0; numeric.has_value() && index < state.segment_count; ++index) {
    if (fraction < state.thresholds[index]) {
      break;
    }
    mask |= 1U << index;
  }

  state.drawn_blinking =
      numeric.has_value() && state.blink_ms > 0 && fraction >= state.blink_threshold;
  const bool blink_visible = !state.drawn_blinking || (lv_tick_get() / state.blink_ms) % 2 == 0;
  if (!update.first_render && mask == state.drawn_mask &&
      blink_visible == state.drawn_blink_visible) {
    return;
  }

  const std::uint32_t drawn_mask = state.drawn_mask;
  const bool drawn_visible = state.drawn_blink_visible;
  state.drawn_mask = mask;
  state.drawn_blink_visible = blink_visible;
  if (update.first_render) {
    lv_obj_invalidate(state.container);
    return;
  }
  lv_area_t content{};
  lv_obj_get_content_coords(state.container, &content);
  for (std::size_t index = 0; index < state.segment_count; ++index) {
    if (lamp_lit(state, mask, blink_visible, index) ==
        lamp_lit(state, drawn_mask, drawn_visible, index)) {
      continue;
    }
    const lv_area_t area = state.arc_shape ? geometry::lamp_arc_area(state, index, content)
                                           : geometry::lamp_area(state, index, content);
    (void)lv_obj_invalidate_area(state.container, &area);
  }
}

}
