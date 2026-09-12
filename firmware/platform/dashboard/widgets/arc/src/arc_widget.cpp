#include "arc_widget.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "arc_gradient.hpp"
#include "lvgl.h"
#include "value_conditions.hpp"
#include "widget_draw_buffer.hpp"
#include "widget_inner_box.hpp"
#include "widget_ring.hpp"

namespace pitrig::dashboard::arc_widget {
namespace {

constexpr char kTag[] = "arc_widget";

constexpr std::int32_t kSweepResolution = 1'000;

constexpr float kFullTurnGapDeg = 0.1F;

constexpr float kNeedleInvalidateMargin = 1.0F;

[[nodiscard]] float drawn_sector(const Config& config) {
  const auto sector = static_cast<float>(config.sector_deg);
  return sector >= 360.0F ? 360.0F - kFullTurnGapDeg : sector;
}

void apply_indicator_color(void* const context, const std::uint32_t rgb) {
  auto& state = *static_cast<State*>(context);
  lv_obj_set_style_arc_color(state.arc, lv_color_hex(rgb), LV_PART_INDICATOR);
  if (state.gradient != nullptr) {
    lv_obj_set_style_arc_image_src(state.arc, rgb == state.fill_rgb ? state.gradient : nullptr,
                                   LV_PART_INDICATOR);
  }
}

[[nodiscard]] bool attach_gradient(State& state, const Config& config, const std::int32_t side,
                                   const float sector_start, const float sector) {
  state.gradient =
      gradient::prepare({.side = side,
                         .thickness_px = config.thickness_px,
                         .start_deg = sector_start,
                         .sector_deg = sector,
                         .inverted = config.inverted,
                         .colours = fill::ramp(config.fill_color, config.fill_grad_mid_color,
                                               config.fill_grad_color)});
  if (state.gradient == nullptr) {
    return false;
  }
  lv_obj_add_event_cb(state.arc, &release_draw_buffer, LV_EVENT_DELETE, state.gradient);
  lv_obj_set_style_arc_image_src(state.arc, state.gradient, LV_PART_INDICATOR);
  return true;
}

void apply_needle_color(void* const context, const std::uint32_t rgb) {
  static_cast<State*>(context)->needle_rgb = rgb;
}

struct Ring {
  float radius{};
  std::int32_t left{};
  std::int32_t top{};
  std::int32_t side{};
};

[[nodiscard]] Ring resolve_ring(const Config& config, const std::int32_t inner_width,
                                const std::int32_t inner_height) {
  const ring::Centre centre = ring::resolve_config(config, inner_width, inner_height);
  const float side = 2.0F * centre.radius + static_cast<float>(config.thickness_px);
  return Ring{centre.radius, static_cast<std::int32_t>(std::lround(centre.x - side / 2.0F)),
              static_cast<std::int32_t>(std::lround(centre.y - side / 2.0F)),
              static_cast<std::int32_t>(std::lround(side))};
}

void point_needle(State& state, const float fraction) {
  const float swept = std::clamp(fraction, 0.0F, 1.0F);
  const float degrees =
      state.sector_start_deg + state.sector_deg * (state.inverted ? 1.0F - swept : swept);
  const float radians = degrees * std::numbers::pi_v<float> / 180.0F;
  state.tip_x = state.centre_x + state.needle_radius * std::cos(radians);
  state.tip_y = state.centre_y + state.needle_radius * std::sin(radians);
}

[[nodiscard]] std::int32_t area_start(const float lowest, const float margin) {
  return static_cast<std::int32_t>(std::floor(lowest - margin));
}

[[nodiscard]] std::int32_t area_end(const float highest, const float margin) {
  return static_cast<std::int32_t>(std::ceil(highest + margin));
}

void invalidate_needle(const State& state, const float previous_x, const float previous_y) {
  const float margin = static_cast<float>(state.needle_width) + kNeedleInvalidateMargin;
  lv_area_t coords{};
  lv_obj_get_coords(state.arc, &coords);
  const lv_area_t area = {
      coords.x1 + area_start(std::min({state.centre_x, previous_x, state.tip_x}), margin),
      coords.y1 + area_start(std::min({state.centre_y, previous_y, state.tip_y}), margin),
      coords.x1 + area_end(std::max({state.centre_x, previous_x, state.tip_x}), margin),
      coords.y1 + area_end(std::max({state.centre_y, previous_y, state.tip_y}), margin)};
  (void)lv_obj_invalidate_area(state.arc, &area);
}

[[nodiscard]] lv_point_precise_t needle_point(const lv_area_t& coords, const float x,
                                              const float y) {
  return {static_cast<lv_value_precise_t>(static_cast<float>(coords.x1) + x),
          static_cast<lv_value_precise_t>(static_cast<float>(coords.y1) + y)};
}

void draw_needle(lv_event_t* const event) {
  auto* const state = static_cast<State*>(lv_event_get_user_data(event));
  lv_layer_t* const layer = lv_event_get_layer(event);
  if (state == nullptr || layer == nullptr || state->arc == nullptr) {
    return;
  }
  lv_area_t coords{};
  lv_obj_get_coords(state->arc, &coords);
  lv_draw_line_dsc_t dsc{};
  lv_draw_line_dsc_init(&dsc);
  dsc.base.layer = layer;
  dsc.color = lv_color_hex(state->needle_rgb);
  dsc.width = state->needle_width;
  dsc.opa = LV_OPA_COVER;
  dsc.round_start = 1;
  dsc.round_end = 1;
  dsc.p1 = needle_point(coords, state->centre_x, state->centre_y);
  dsc.p2 = needle_point(coords, state->tip_x, state->tip_y);
  lv_draw_line(layer, &dsc);
}

void extend_needle_area(lv_event_t* const event) {
  auto* const state = static_cast<State*>(lv_event_get_user_data(event));
  auto* const size = static_cast<std::int32_t*>(lv_event_get_param(event));
  if (state != nullptr && size != nullptr && *size < state->needle_width) {
    *size = state->needle_width;
  }
}

void build_needle(State& state, const Config& config, const Ring& ring, const float sector_start) {
  lv_obj_set_style_arc_opa(state.arc, LV_OPA_TRANSP, LV_PART_INDICATOR);
  state.needle = true;
  state.needle_rgb = config.fill_color;
  state.needle_width = config.thickness_px;
  state.centre_x = static_cast<float>(ring.side) / 2.0F;
  state.centre_y = static_cast<float>(ring.side) / 2.0F;
  state.needle_radius = ring.radius;
  state.sector_start_deg = sector_start;
  state.sector_deg = static_cast<float>(config.sector_deg);
  point_needle(state, 0.0F);
  lv_obj_add_event_cb(state.arc, &draw_needle, LV_EVENT_DRAW_MAIN_END, &state);
  lv_obj_add_event_cb(state.arc, &extend_needle_area, LV_EVENT_REFR_EXT_DRAW_SIZE, &state);
  lv_obj_refresh_ext_draw_size(state.arc);
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
  state.inverted = config.inverted;
  state.free_running = binding.fast_updates;
  state.fill_rgb = config.fill_color;

  const InnerBox inner = inner_box(config.frame, bounds);
  const Ring ring = resolve_ring(config, inner.width, inner.height);
  const auto sector = static_cast<float>(config.sector_deg);
  const float sector_start = ring::sector_start(config.center_angle_deg, sector);

  state.arc = lv_arc_create(box.container);
  lv_obj_remove_style_all(state.arc);
  lv_obj_set_pos(state.arc, ring.left, ring.top);
  lv_obj_set_size(state.arc, ring.side, ring.side);
  lv_obj_remove_flag(state.arc, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(state.arc, LV_OBJ_FLAG_SCROLLABLE);
  lv_arc_set_mode(state.arc, config.inverted ? LV_ARC_MODE_REVERSE : LV_ARC_MODE_NORMAL);
  lv_arc_set_bg_angles(state.arc, static_cast<lv_value_precise_t>(sector_start),
                       static_cast<lv_value_precise_t>(sector_start + drawn_sector(config)));
  lv_arc_set_range(state.arc, 0, kSweepResolution);
  lv_arc_set_value(state.arc, 0);
  lv_obj_set_style_arc_width(state.arc, config.thickness_px, LV_PART_MAIN);
  lv_obj_set_style_arc_width(state.arc, config.thickness_px, LV_PART_INDICATOR);
  lv_obj_set_style_arc_color(state.arc, lv_color_hex(config.fill_color), LV_PART_INDICATOR);
  lv_obj_set_style_arc_opa(state.arc, LV_OPA_COVER, LV_PART_INDICATOR);
  const bool has_track = config.track_color != configuration::kTransparentColor;
  lv_obj_set_style_arc_color(state.arc, lv_color_hex(has_track ? config.track_color : 0x000000),
                             LV_PART_MAIN);
  lv_obj_set_style_arc_opa(state.arc, has_track ? LV_OPA_COVER : LV_OPA_TRANSP, LV_PART_MAIN);
  state.drawn_per_mille = -1;
  const bool ring_mark = config.mark == configuration::ArcMark::ring;
  if (ring_mark && config.fill_grad_color != configuration::kTransparentColor &&
      !attach_gradient(state, config, ring.side, sector_start, sector)) {
    return false;
  }

  if (config.mark == configuration::ArcMark::needle) {
    build_needle(state, config, ring, sector_start);
    state.painter.configure(config.frame, box, config.fill_color, &apply_needle_color, &state);
  } else {
    state.painter.configure(config.frame, box, config.fill_color, &apply_indicator_color, &state);
  }
  state.painter.bind(binding.condition_read, binding.condition_context);
  state.painter.bind_caption(binding.caption_read, binding.caption_context);
  return true;
}

void Collection::render_state(State& state) {
  const ValueUpdate update = take_value(state);
  state.painter.render();
  if (!update.changed) {
    return;
  }
  state.initialized = true;

  const std::optional<double> numeric = conditions::condition_value(update.value);
  const float fraction =
      conditions::range_fraction(numeric.has_value() ? *numeric : 0.0, state.range);
  const auto per_mille =
      static_cast<std::int32_t>(static_cast<float>(kSweepResolution) * fraction + 0.5F);
  if (!update.first_render && per_mille == state.drawn_per_mille) {
    return;
  }
  state.drawn_per_mille = per_mille;
  if (state.needle) {
    const float previous_x = state.tip_x;
    const float previous_y = state.tip_y;
    point_needle(state, static_cast<float>(per_mille) / static_cast<float>(kSweepResolution));
    invalidate_needle(state, previous_x, previous_y);
    return;
  }
  lv_arc_set_value(state.arc, per_mille);
}

}
