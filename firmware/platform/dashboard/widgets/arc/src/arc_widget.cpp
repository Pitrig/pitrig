#include "arc_widget.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "ring_geometry.hpp"
#include "widget_conditions.hpp"

namespace simcore::dashboard::arc_widget {
namespace {

constexpr char kTag[] = "arc_widget";

constexpr std::int32_t kSweepResolution = 1'000;

constexpr float kFullTurnGapDeg = 0.1F;

[[nodiscard]] float drawn_sweep(const Config& config) {
  const auto sweep = static_cast<float>(config.sweep_deg);
  return sweep >= 360.0F ? 360.0F - kFullTurnGapDeg : sweep;
}

void apply_indicator_color(void* const context, const std::uint32_t rgb) {
  lv_obj_set_style_arc_color(static_cast<lv_obj_t*>(context), lv_color_hex(rgb),
                             LV_PART_INDICATOR);
}

void apply_needle_color(void* const context, const std::uint32_t rgb) {
  lv_obj_set_style_line_color(static_cast<lv_obj_t*>(context), lv_color_hex(rgb),
                              LV_PART_MAIN);
}

struct Ring {
  float radius{};
  std::int32_t left{};
  std::int32_t top{};
  std::int32_t side{};
};

Ring resolve_ring(const Config& config, const std::int32_t inner_width,
                  const std::int32_t inner_height) {
  const ring::Centre centre =
      ring::resolve(config.thickness_px, config.radius_px, config.center_x_px,
                    config.center_y_px, inner_width, inner_height);
  const float side =
      2.0F * centre.radius + static_cast<float>(config.thickness_px);
  return Ring{centre.radius,
              static_cast<std::int32_t>(std::lround(centre.x - side / 2.0F)),
              static_cast<std::int32_t>(std::lround(centre.y - side / 2.0F)),
              static_cast<std::int32_t>(std::lround(side))};
}

void point_needle(State& state, const float fraction) {
  const float degrees =
      state.start_angle_deg + state.sweep_deg * std::clamp(fraction, 0.0F, 1.0F);
  const float radians = degrees * std::numbers::pi_v<float> / 180.0F;
  state.needle_points[0] = {static_cast<lv_value_precise_t>(state.centre_x),
                            static_cast<lv_value_precise_t>(state.centre_y)};
  state.needle_points[1] = {
      static_cast<lv_value_precise_t>(state.centre_x +
                                      state.needle_radius * std::cos(radians)),
      static_cast<lv_value_precise_t>(state.centre_y +
                                      state.needle_radius * std::sin(radians))};
  lv_line_set_points(state.needle, state.needle_points.data(),
                     state.needle_points.size());
}

}


bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const frame::ValueBinding& binding,
                       const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.read = binding.read;
  state.read_context = binding.read_context;
  state.range = config.range;
  state.inverted = config.inverted;
  state.free_running = binding.fast_updates;

  const std::int32_t border = config.frame.border.width_px;
  const std::int32_t inner_width = std::max<std::int32_t>(
      bounds.width - 2 * border - config.frame.padding.left -
          config.frame.padding.right,
      0);
  const std::int32_t inner_height = std::max<std::int32_t>(
      bounds.height - 2 * border - config.frame.padding.top -
          config.frame.padding.bottom,
      0);

  const Ring ring = resolve_ring(config, inner_width, inner_height);

  state.arc = lv_arc_create(box.container);
  lv_obj_remove_style_all(state.arc);
  lv_obj_set_pos(state.arc, ring.left, ring.top);
  lv_obj_set_size(state.arc, ring.side, ring.side);
  lv_obj_remove_flag(state.arc, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(state.arc, LV_OBJ_FLAG_SCROLLABLE);
  lv_arc_set_mode(state.arc, LV_ARC_MODE_NORMAL);
  lv_arc_set_bg_angles(
      state.arc, static_cast<lv_value_precise_t>(config.start_angle_deg),
      static_cast<lv_value_precise_t>(static_cast<float>(config.start_angle_deg) +
                                      drawn_sweep(config)));
  lv_arc_set_range(state.arc, 0, kSweepResolution);
  lv_arc_set_value(state.arc, 0);
  lv_obj_set_style_arc_width(state.arc, config.thickness_px, LV_PART_MAIN);
  lv_obj_set_style_arc_width(state.arc, config.thickness_px, LV_PART_INDICATOR);
  lv_obj_set_style_arc_color(state.arc, lv_color_hex(config.fill_color),
                             LV_PART_INDICATOR);
  lv_obj_set_style_arc_opa(state.arc, LV_OPA_COVER, LV_PART_INDICATOR);
  const bool has_track = config.track_color != configuration::kTransparentColor;
  lv_obj_set_style_arc_color(
      state.arc, lv_color_hex(has_track ? config.track_color : 0x000000),
      LV_PART_MAIN);
  lv_obj_set_style_arc_opa(state.arc, has_track ? LV_OPA_COVER : LV_OPA_TRANSP,
                           LV_PART_MAIN);
  state.drawn_per_mille = -1;

  if (config.mark == configuration::ArcMark::needle) {
    lv_obj_set_style_arc_opa(state.arc, LV_OPA_TRANSP, LV_PART_INDICATOR);
    state.centre_x = static_cast<float>(ring.side) / 2.0F;
    state.centre_y = static_cast<float>(ring.side) / 2.0F;
    state.needle_radius = ring.radius;
    state.start_angle_deg = static_cast<float>(config.start_angle_deg);
    state.sweep_deg = static_cast<float>(config.sweep_deg);
    state.needle = lv_line_create(box.container);
    lv_obj_remove_style_all(state.needle);
    lv_obj_set_pos(state.needle, ring.left, ring.top);
    lv_obj_set_size(state.needle, ring.side, ring.side);
    lv_obj_remove_flag(state.needle, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(state.needle, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_line_width(state.needle, config.thickness_px, LV_PART_MAIN);
    lv_obj_set_style_line_color(state.needle, lv_color_hex(config.fill_color),
                                LV_PART_MAIN);
    lv_obj_set_style_line_opa(state.needle, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_line_rounded(state.needle, true, LV_PART_MAIN);
    point_needle(state, state.inverted ? 1.0F : 0.0F);
  }

  state.painter.configure(config.frame, box, config.fill_color,
                          state.needle != nullptr ? &apply_needle_color
                                                  : &apply_indicator_color,
                          state.needle != nullptr ? state.needle : state.arc);
  state.painter.bind(binding.condition_read, binding.condition_context);
  state.painter.bind_caption(binding.caption_read, binding.caption_context);
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
  if (!changed) {
    return;
  }
  state.initialized = true;

  const std::optional<double> numeric = conditions::condition_value(value);
  const float fraction =
      numeric.has_value() ? conditions::range_fraction(*numeric, state.range)
                          : 0.0F;
  const auto per_mille = static_cast<std::int32_t>(
      static_cast<float>(kSweepResolution) *
          (state.inverted ? 1.0F - fraction : fraction) +
      0.5F);
  if (!first_render && per_mille == state.drawn_per_mille) {
    return;
  }
  state.drawn_per_mille = per_mille;
  if (state.needle != nullptr) {
    point_needle(state, static_cast<float>(per_mille) /
                            static_cast<float>(kSweepResolution));
    return;
  }
  lv_arc_set_value(state.arc, per_mille);
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

}
