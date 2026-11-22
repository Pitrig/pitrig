#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "track_map_drawing.hpp"
#include "track_map_projection.hpp"
#include "track_map_raster.hpp"

namespace pitrig::dashboard::track_map_widget::drawing {
namespace {

constexpr std::int32_t kSpriteMarginPx = 3;

[[nodiscard]] bool painted(const std::uint32_t rgb) {
  return rgb != configuration::kTransparentColor;
}

[[nodiscard]] std::uint32_t car_color(const Style& style, const track_map::Car& car) {
  const auto role = static_cast<std::size_t>(car.role);
  if (role < style.role_rgb.size() && painted(style.role_rgb[role])) {
    return style.role_rgb[role];
  }
  if (car.car_class >= 1 && car.car_class <= kClassColors &&
      painted(style.class_rgb[car.car_class - 1U])) {
    return style.class_rgb[car.car_class - 1U];
  }
  return style.car_rgb;
}

[[nodiscard]] ScreenPoint place(const State& state, const track_map::Car& car) {
  ScreenPoint point{};
  if (car.pit && painted(state.style.pit_lane_rgb) &&
      projection::on_pit_lane(state.projection, car.fraction, point)) {
    return point;
  }
  return projection::on_track(state.projection, car.fraction);
}

[[nodiscard]] Dot dot_of(const State& state, const track_map::Car& car) {
  const ScreenPoint point = place(state, car);
  constexpr auto kQuarters = static_cast<float>(kQuartersPerPixel);
  Dot dot{
      .x_quarters = static_cast<std::int16_t>(std::lround(point.x * kQuarters)),
      .y_quarters = static_cast<std::int16_t>(std::lround(point.y * kQuarters)),
      .rgb = car_color(state.style, car),
      .opa = LV_OPA_COVER,
      .player = car.role == track_map::CarRole::player,
      .fraction = static_cast<std::uint16_t>(static_cast<std::uint32_t>(std::lround(car.fraction)) &
                                             (track_map::kLapUnits - 1)),
  };
  if (dot.player) {
    dot.rgb = state.style.player_rgb;
  } else if (car.pit) {
    if (painted(state.style.pit_car_rgb)) {
      dot.rgb = state.style.pit_car_rgb;
    } else {
      dot.opa = LV_OPA_50;
    }
  }
  return dot;
}

[[nodiscard]] std::int32_t whole_pixels(const std::int32_t quarters) {
  return quarters >= 0 ? quarters / kQuartersPerPixel
                       : (quarters - kQuartersPerPixel + 1) / kQuartersPerPixel;
}

[[nodiscard]] std::int32_t phase_of(const std::int32_t quarters) {
  return quarters - whole_pixels(quarters) * kQuartersPerPixel;
}

[[nodiscard]] const lv_draw_buf_t* phased(const SpriteSet& sprites, const Dot& dot) {
  const std::int32_t phase =
      phase_of(dot.x_quarters) + kQuartersPerPixel * phase_of(dot.y_quarters);
  return sprites[static_cast<std::size_t>(phase)];
}

[[nodiscard]] const lv_draw_buf_t* outer_sprite(const State& state, const Dot& dot) {
  return phased(dot.player ? state.sprites.player_ring : state.sprites.car_halo, dot);
}

[[nodiscard]] const lv_draw_buf_t* inner_sprite(const State& state, const Dot& dot) {
  return phased(dot.player ? state.sprites.player : state.sprites.car, dot);
}

[[nodiscard]] lv_area_t sprite_area(const lv_draw_buf_t& sprite, const Dot& dot,
                                    const lv_area_t& origin) {
  const auto side = static_cast<std::int32_t>(sprite.header.w);
  const std::int32_t left = origin.x1 + whole_pixels(dot.x_quarters) - side / 2;
  const std::int32_t top = origin.y1 + whole_pixels(dot.y_quarters) - side / 2;
  return {left, top, left + side - 1, top + side - 1};
}

void draw_sprite(lv_layer_t* const layer, const lv_draw_buf_t* const sprite, const Dot& dot,
                 const lv_area_t& origin, const std::uint32_t rgb) {
  if (sprite == nullptr) {
    return;
  }
  lv_draw_image_dsc_t descriptor;
  lv_draw_image_dsc_init(&descriptor);
  descriptor.src = sprite;
  descriptor.recolor = lv_color_hex(rgb);
  descriptor.recolor_opa = LV_OPA_COVER;
  descriptor.opa = dot.opa;
  const lv_area_t area = sprite_area(*sprite, dot, origin);
  lv_draw_image(layer, &descriptor, &area);
}

[[nodiscard]] lv_area_t joined(const lv_area_t& first, const lv_area_t& second) {
  return {std::min(first.x1, second.x1), std::min(first.y1, second.y1),
          std::max(first.x2, second.x2), std::max(first.y2, second.y2)};
}

void include(const State& state, const Dot* const dot, const lv_area_t& origin, lv_area_t& area,
             bool& any) {
  const lv_draw_buf_t* const sprite = dot == nullptr ? nullptr : outer_sprite(state, *dot);
  if (sprite == nullptr) {
    return;
  }
  const lv_area_t box = sprite_area(*sprite, *dot, origin);
  area = any ? joined(area, box) : box;
  any = true;
}

[[nodiscard]] std::uint32_t gap_after(const std::span<const DamagedDot> damaged,
                                      const std::size_t index) {
  const DamagedDot& next = damaged[(index + 1) % damaged.size()];
  return (next.fraction - damaged[index].fraction) & (track_map::kLapUnits - 1);
}

[[nodiscard]] std::size_t group(const std::span<DamagedDot> damaged,
                                const std::span<lv_area_t> areas) {
  const std::size_t groups = std::min(damaged.size(), areas.size());
  if (groups == 0) {
    return 0;
  }
  std::ranges::sort(damaged, {}, &DamagedDot::fraction);
  std::array<std::uint8_t, track_map::kMaximumCars> cuts{};
  const auto cut_span = std::span{cuts}.first(damaged.size());
  for (std::size_t index = 0; index < cut_span.size(); ++index) {
    cut_span[index] = static_cast<std::uint8_t>(index);
  }
  std::ranges::partial_sort(cut_span, cut_span.begin() + static_cast<std::ptrdiff_t>(groups),
                            [&](const std::uint8_t left, const std::uint8_t right) {
                              return gap_after(damaged, left) > gap_after(damaged, right);
                            });
  std::ranges::sort(cut_span.first(groups));
  for (std::size_t group_index = 0; group_index < groups; ++group_index) {
    const std::size_t first = cuts[group_index] + 1U;
    const std::size_t last =
        group_index + 1 < groups ? cuts[group_index + 1] : cuts[0] + damaged.size();
    lv_area_t area = damaged[first % damaged.size()].area;
    for (std::size_t index = first + 1; index <= last; ++index) {
      area = joined(area, damaged[index % damaged.size()].area);
    }
    areas[group_index] = area;
  }
  return groups;
}

}

lv_draw_buf_t* make_sprite(const float diameter, const std::int32_t column,
                           const std::int32_t row) {
  const auto side = static_cast<std::int32_t>(std::ceil(diameter)) + kSpriteMarginPx;
  lv_draw_buf_t* const sprite = lv_draw_buf_create(static_cast<std::uint32_t>(side),
                                                   static_cast<std::uint32_t>(side),
                                                   LV_COLOR_FORMAT_A8, 0);
  if (sprite == nullptr) {
    return nullptr;
  }
  const auto center = static_cast<float>(side / 2);
  constexpr float kStep = 1.0F / static_cast<float>(kQuartersPerPixel);
  const ScreenPoint shifted{center + static_cast<float>(column) * kStep,
                            center + static_cast<float>(row) * kStep};
  raster::disc({sprite->data, sprite->data_size}, static_cast<std::int32_t>(sprite->header.stride),
               side, diameter, shifted);
  return sprite;
}

std::size_t place_cars(const State& state, const std::span<const track_map::Car> cars,
                       const std::span<Dot> dots) {
  std::size_t count = 0;
  const track_map::Car* player = nullptr;
  for (const track_map::Car& car : cars) {
    if (car.role == track_map::CarRole::player) {
      player = &car;
    } else if (count + 1 < dots.size()) {
      dots[count++] = dot_of(state, car);
    }
  }
  if (player != nullptr && count < dots.size()) {
    dots[count++] = dot_of(state, *player);
  }
  return count;
}

std::size_t damage(const State& state, const std::span<const Dot> before,
                   const std::span<const Dot> after, const lv_area_t& origin,
                   const std::span<DamagedDot> scratch, const std::span<lv_area_t> areas) {
  std::size_t count = 0;
  const std::size_t dots = std::min(std::max(before.size(), after.size()), scratch.size());
  for (std::size_t index = 0; index < dots; ++index) {
    const Dot* const was = index < before.size() ? &before[index] : nullptr;
    const Dot* const now = index < after.size() ? &after[index] : nullptr;
    if (was != nullptr && now != nullptr && *was == *now) {
      continue;
    }
    lv_area_t area{};
    bool any = false;
    include(state, was, origin, area, any);
    include(state, now, origin, area, any);
    if (any) {
      scratch[count++] = {.fraction = (now != nullptr ? now : was)->fraction, .area = area};
    }
  }
  return group(scratch.first(count), areas);
}

void draw_cars(lv_event_t* const event) {
  const auto& state = *static_cast<const State*>(lv_event_get_user_data(event));
  lv_layer_t* const layer = lv_event_get_layer(event);
  if (layer == nullptr || state.canvas == nullptr || state.dot_count == 0) {
    return;
  }
  lv_area_t origin{};
  lv_obj_get_coords(state.canvas, &origin);
  const std::uint32_t ring =
      painted(state.style.player_border_rgb) ? state.style.player_border_rgb : state.background_rgb;
  for (std::size_t index = 0; index < state.dot_count; ++index) {
    const Dot& dot = state.dots[index];
    const std::uint32_t outline = dot.player ? ring : state.background_rgb;
    draw_sprite(layer, outer_sprite(state, dot), dot, origin, outline);
    draw_sprite(layer, inner_sprite(state, dot), dot, origin, dot.rgb);
  }
}

}
