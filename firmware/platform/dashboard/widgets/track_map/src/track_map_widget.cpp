#include "track_map_widget.hpp"

#include <algorithm>
#include <limits>

#include "logger.hpp"
#include "track_map_drawing.hpp"
#include "track_map_projection.hpp"
#include "widget_draw_buffer.hpp"
#include "widget_inner_box.hpp"

namespace pitrig::dashboard::track_map_widget {
namespace {

constexpr char kTag[] = "track_map_widget";
constexpr std::int32_t kMinimumSidePx = 16;
constexpr std::uint32_t kNoGeneration = std::numeric_limits<std::uint32_t>::max();

void apply_line_color(void* const context, const std::uint32_t rgb) {
  auto& state = *static_cast<State*>(context);
  if (state.override_rgb != rgb) {
    state.override_rgb = rgb;
    state.outline_dirty = true;
  }
}

[[nodiscard]] Style style_of(const Config& config) {
  Style style{
      .line_rgb = config.line_color,
      .sector_rgb = {config.sector_1_color, config.sector_2_color, config.sector_3_color},
      .pit_lane_rgb = config.pit_lane_color,
      .finish_rgb = config.finish_line_color,
      .car_rgb = config.car_color,
      .player_rgb = config.player_color,
      .player_border_rgb = config.player_border_color,
      .pit_car_rgb = config.pit_car_color,
      .class_rgb = {config.class_1_color, config.class_2_color, config.class_3_color,
                    config.class_4_color},
      .line_width = config.line_width_px,
      .car_size = config.car_size_px,
      .player_size = config.player_size_px,
      .rotation_deg = config.rotation_deg,
      .refresh_ms = config.refresh_ms,
      .fit_rotation = config.fit_rotation,
  };
  style.role_rgb.fill(configuration::kTransparentColor);
  style.role_rgb[static_cast<std::size_t>(track_map::CarRole::ahead)] = config.ahead_color;
  style.role_rgb[static_cast<std::size_t>(track_map::CarRole::behind)] = config.behind_color;
  style.role_rgb[static_cast<std::size_t>(track_map::CarRole::lapping)] = config.lapping_color;
  style.role_rgb[static_cast<std::size_t>(track_map::CarRole::lapped)] = config.lapped_color;
  return style;
}

[[nodiscard]] lv_area_t joined(const lv_area_t& first, const lv_area_t& second) {
  return {std::min(first.x1, second.x1), std::min(first.y1, second.y1),
          std::max(first.x2, second.x2), std::max(first.y2, second.y2)};
}

}

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const frame::ValueBinding& binding, const fonts::Registry& fonts,
                       const track_map::Service* const service) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent, bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.service = service;
  state.style = style_of(config);
  state.override_rgb = configuration::kTransparentColor;
  state.background_rgb = config.frame.background_color == configuration::kTransparentColor
                             ? frame::background_behind(parent)
                             : config.frame.background_color;
  const std::int32_t reserve =
      corner_reserve(config.frame.border.radius_px, config.frame.border.width_px);
  const InnerBox inner = inner_box(config.frame, bounds, reserve);
  state.width = inner.width;
  state.height = inner.height;
  state.painter.configure(config.frame, box, configuration::kTransparentColor, &apply_line_color,
                          &state);
  state.painter.bind(binding.condition_read, binding.condition_context);
  state.painter.bind_caption(binding.caption_read, binding.caption_context);
  if (state.width < kMinimumSidePx || state.height < kMinimumSidePx) {
    return true;
  }
  state.canvas = lv_canvas_create(box.container);
  if (state.canvas == nullptr) {
    log::error(kTag, "Failed to create the track map canvas");
    return false;
  }
  lv_draw_buf_t* const buffer =
      lv_draw_buf_create(static_cast<std::uint32_t>(state.width),
                         static_cast<std::uint32_t>(state.height), LV_COLOR_FORMAT_RGB565, 0);
  if (buffer == nullptr) {
    log::error(kTag, "No memory for a %d x %d track map", static_cast<int>(state.width),
               static_cast<int>(state.height));
    return false;
  }
  lv_canvas_set_draw_buf(state.canvas, buffer);
  lv_obj_add_event_cb(state.canvas, release_draw_buffer, LV_EVENT_DELETE, buffer);
  lv_obj_add_event_cb(state.canvas, &drawing::draw_cars, LV_EVENT_DRAW_POST, &state);
  lv_obj_remove_flag(state.canvas, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(state.canvas, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_pos(state.canvas, reserve, reserve);
  lv_obj_set_size(state.canvas, state.width, state.height);
  state.generation = kNoGeneration;
  state.outline_dirty = true;
  state.dot_count = 0;
  state.dots_shown = false;
  state.refreshed_at = lv_tick_get() - state.style.refresh_ms;
  return true;
}

bool Collection::create(const Layout& layout, const std::span<const Config> configurations,
                        const std::span<const frame::ValueBinding> bindings,
                        const fonts::Registry& fonts, const track_map::Service* const service) {
  if (layout.display == nullptr || configurations.size() != bindings.size()) {
    return false;
  }
  return build_all(bindings.size(), [&](State& state, const std::size_t index) {
    return build(state, layout, configurations[index], bindings[index], fonts, service);
  });
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration, const frame::ValueBinding& binding,
                          const fonts::Registry& fonts, const track_map::Service* const service) {
  return rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, binding, fonts, service);
  });
}

void Collection::render_state(State& state) {
  state.painter.render();
  if (state.canvas == nullptr) {
    return;
  }
  refresh_outline(state);
  refresh_cars(state);
}

void Collection::refresh_outline(State& state) {
  const std::uint32_t generation = state.service != nullptr ? state.service->generation() : 0;
  if (generation == state.generation && !state.outline_dirty) {
    return;
  }
  if (generation != state.generation) {
    outline_.track_count = 0;
    outline_.pit_count = 0;
    outline_.sector_count = 0;
    state.generation = state.service != nullptr ? state.service->copy_outline(outline_) : 0;
    const projection::Fit fit{
        .width = state.width,
        .height = state.height,
        .margin = projection::margin(state.style),
        .rotation_deg = state.style.rotation_deg,
        .fit_rotation = state.style.fit_rotation,
    };
    projection::project(outline_, fit, state.projection);
    state.refreshed_at = lv_tick_get() - state.style.refresh_ms;
  }
  state.outline_dirty = false;
  drawing::draw_outline(state);
  lv_obj_invalidate(state.canvas);
}

void Collection::refresh_cars(State& state) {
  const std::uint32_t now = lv_tick_get();
  if (now - state.refreshed_at < state.style.refresh_ms) {
    return;
  }
  state.refreshed_at = now;
  const std::size_t car_count = state.service != nullptr ? state.service->read_cars(cars_) : 0;
  const std::size_t dot_count =
      drawing::place_cars(state, std::span{cars_}.first(car_count), placed_);
  const std::span<const Dot> next{placed_.data(), dot_count};
  if (dot_count == state.dot_count &&
      std::equal(next.begin(), next.end(), state.dots.begin())) {
    return;
  }
  lv_area_t origin{};
  lv_obj_get_coords(state.canvas, &origin);
  lv_area_t area{};
  const bool shown = drawing::cars_area(next, origin, area);
  const lv_area_t invalid = shown && state.dots_shown ? joined(area, state.dots_area)
                            : shown                   ? area
                                                      : state.dots_area;
  std::copy(next.begin(), next.end(), state.dots.begin());
  state.dot_count = dot_count;
  if (shown || state.dots_shown) {
    lv_obj_invalidate_area(state.canvas, &invalid);
  }
  state.dots_area = area;
  state.dots_shown = shown;
}

}
