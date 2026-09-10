#include "arc_widget.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "arc_gradient.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "ring_geometry.hpp"
#include "value_conditions.hpp"

namespace pitrig::dashboard::arc_widget {
namespace {

constexpr char kTag[] = "arc_widget";

constexpr std::int32_t kSweepResolution = 1'000;

constexpr float kFullTurnGapDeg = 0.1F;

[[nodiscard]] float drawn_sector(const Config& config) {
  const auto sector = static_cast<float>(config.sector_deg);
  return sector >= 360.0F ? 360.0F - kFullTurnGapDeg : sector;
}

void apply_indicator_color(void* const context, const std::uint32_t rgb) {
  auto& state = *static_cast<State*>(context);
  lv_obj_set_style_arc_color(state.arc, lv_color_hex(rgb), LV_PART_INDICATOR);
  if (state.gradient != nullptr) {
    lv_obj_set_style_arc_image_src(
        state.arc, rgb == state.fill_rgb ? state.gradient : nullptr,
        LV_PART_INDICATOR);
  }
}

void release_gradient(lv_event_t* const event) {
  auto* const buffer =
      static_cast<lv_draw_buf_t*>(lv_event_get_user_data(event));
  if (buffer != nullptr) {
    lv_draw_buf_destroy(buffer);
  }
}

[[nodiscard]] bool attach_gradient(State& state, const Config& config,
                                   const std::int32_t side,
                                   const float sector_start,
                                   const float sector) {
  state.gradient = gradient::prepare({.side = side,
                                      .thickness_px = config.thickness_px,
                                      .start_deg = sector_start,
                                      .sector_deg = sector,
                                      .inverted = config.inverted,
                                      .from_rgb = config.fill_color,
                                      .to_rgb = config.fill_grad_color});
  if (state.gradient == nullptr) {
    return false;
  }
  lv_obj_add_event_cb(state.arc, &release_gradient, LV_EVENT_DELETE,
                      state.gradient);
  lv_obj_set_style_arc_image_src(state.arc, state.gradient, LV_PART_INDICATOR);
  return true;
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
      ring::resolve({.thickness_px = config.thickness_px,
                     .radius_px = config.radius_px,
                     .x_offset_px = config.x_offset_px,
                     .y_offset_px = config.y_offset_px,
                     .center_angle_deg = config.center_angle_deg,
                     .sector_deg = config.sector_deg,
                     .center_on_figure = config.centering ==
                                         configuration::RingCentering::figure},
                    inner_width, inner_height);
  const float side =
      2.0F * centre.radius + static_cast<float>(config.thickness_px);
  return Ring{centre.radius,
              static_cast<std::int32_t>(std::lround(centre.x - side / 2.0F)),
              static_cast<std::int32_t>(std::lround(centre.y - side / 2.0F)),
              static_cast<std::int32_t>(std::lround(side))};
}

void point_needle(State& state, const float fraction) {
  const float degrees = state.sector_start_deg +
                        state.sector_deg * std::clamp(fraction, 0.0F, 1.0F);
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
  state.fill_rgb = config.fill_color;

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
  const auto sector = static_cast<float>(config.sector_deg);
  const float sector_start = ring::sector_start(config.center_angle_deg, sector);

  state.arc = lv_arc_create(box.container);
  lv_obj_remove_style_all(state.arc);
  lv_obj_set_pos(state.arc, ring.left, ring.top);
  lv_obj_set_size(state.arc, ring.side, ring.side);
  lv_obj_remove_flag(state.arc, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(state.arc, LV_OBJ_FLAG_SCROLLABLE);
  lv_arc_set_mode(state.arc, LV_ARC_MODE_NORMAL);
  lv_arc_set_bg_angles(
      state.arc, static_cast<lv_value_precise_t>(sector_start),
      static_cast<lv_value_precise_t>(sector_start + drawn_sector(config)));
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
  const bool ring_mark = config.mark == configuration::ArcMark::ring;
  if (ring_mark &&
      config.fill_grad_color != configuration::kTransparentColor &&
      !attach_gradient(state, config, ring.side, sector_start, sector)) {
    return false;
  }

  if (config.mark == configuration::ArcMark::needle) {
    lv_obj_set_style_arc_opa(state.arc, LV_OPA_TRANSP, LV_PART_INDICATOR);
    state.centre_x = static_cast<float>(ring.side) / 2.0F;
    state.centre_y = static_cast<float>(ring.side) / 2.0F;
    state.needle_radius = ring.radius;
    state.sector_start_deg = sector_start;
    state.sector_deg = sector;
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

  if (state.needle != nullptr) {
    state.painter.configure(config.frame, box, config.fill_color,
                            &apply_needle_color, state.needle);
  } else {
    state.painter.configure(config.frame, box, config.fill_color,
                            &apply_indicator_color, &state);
  }
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
