#include "track_map_widget.hpp"

#include <algorithm>
#include <array>
#include <limits>
#include <span>

#include "logger.hpp"
#include "lvgl_private.h"
#include "track_map_drawing.hpp"
#include "track_map_projection.hpp"
#include "widget_draw_buffer.hpp"
#include "widget_inner_box.hpp"

namespace pitrig::dashboard::track_map_widget {
namespace {

constexpr char kTag[] = "track_map_widget";
constexpr std::int32_t kMinimumSidePx = 16;
constexpr std::uint32_t kNoGeneration = std::numeric_limits<std::uint32_t>::max();
constexpr std::size_t kInvalidAreaShare = LV_INV_BUF_SIZE / 2;

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
      .sector_mark_rgb = config.sector_mark_color,
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

[[nodiscard]] SpriteSet make_sprites(const float diameter) {
  SpriteSet sprites{};
  for (std::int32_t row = 0; row < kQuartersPerPixel; ++row) {
    for (std::int32_t column = 0; column < kQuartersPerPixel; ++column) {
      sprites[static_cast<std::size_t>(row * kQuartersPerPixel + column)] =
          drawing::make_sprite(diameter, column, row);
    }
  }
  return sprites;
}

void release_sprites(lv_event_t* const event) {
  auto& sprites = *static_cast<Sprites*>(lv_event_get_user_data(event));
  for (SpriteSet* const set :
       {&sprites.car, &sprites.car_halo, &sprites.player, &sprites.player_ring}) {
    for (lv_draw_buf_t*& sprite : *set) {
      if (sprite != nullptr) {
        lv_draw_buf_destroy(sprite);
        sprite = nullptr;
      }
    }
  }
}

[[nodiscard]] std::size_t damage_budget(lv_obj_t* const canvas) {
  const lv_display_t* const display = lv_obj_get_display(canvas);
  const std::size_t used = display != nullptr ? display->inv_p : 0;
  const std::size_t room = used < kInvalidAreaShare ? kInvalidAreaShare - used : 0;
  return std::clamp<std::size_t>(room, 1, kMaximumDamageAreas);
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
  const auto car = static_cast<float>(state.style.car_size);
  const auto player = static_cast<float>(state.style.player_size);
  state.sprites = {
      .car = make_sprites(car),
      .car_halo = make_sprites(car + 2.0F),
      .player = make_sprites(player),
      .player_ring = make_sprites(player + 2.0F),
  };
  lv_obj_add_event_cb(state.canvas, release_sprites, LV_EVENT_DELETE, &state.sprites);
  state.generation = kNoGeneration;
  state.outline_dirty = true;
  state.dot_count = 0;
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
  const std::span<const Dot> shown{state.dots.data(), state.dot_count};
  if (std::ranges::equal(next, shown)) {
    return;
  }
  lv_area_t origin{};
  lv_obj_get_coords(state.canvas, &origin);
  std::array<lv_area_t, kMaximumDamageAreas> areas{};
  const std::size_t area_count =
      drawing::damage(state, shown, next, origin, damaged_,
                      std::span{areas}.first(damage_budget(state.canvas)));
  std::ranges::copy(next, state.dots.begin());
  state.dot_count = dot_count;
  for (const lv_area_t& area : std::span{areas}.first(area_count)) {
    lv_obj_invalidate_area(state.canvas, &area);
  }
}

}
