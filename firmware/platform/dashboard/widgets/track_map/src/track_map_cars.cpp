#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>

#include "application_configuration.hpp"
#include "track_map_drawing.hpp"
#include "track_map_projection.hpp"

namespace pitrig::dashboard::track_map_widget::drawing {
namespace {

constexpr std::uint8_t kRingPx = 2;
constexpr std::uint8_t kMaximumDiameter = 255;

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
  const Style& style = state.style;
  const ScreenPoint point = place(state, car);
  Dot dot{
      .x = static_cast<std::int16_t>(std::lround(point.x)),
      .y = static_cast<std::int16_t>(std::lround(point.y)),
      .border_rgb = configuration::kTransparentColor,
      .opa = LV_OPA_COVER,
  };
  if (car.role == track_map::CarRole::player) {
    const bool ringed = painted(style.player_border_rgb);
    dot.rgb = style.player_rgb;
    dot.border_rgb = style.player_border_rgb;
    dot.diameter = static_cast<std::uint8_t>(
        std::min<std::uint32_t>(style.player_size + (ringed ? kRingPx : 0), kMaximumDiameter));
    return dot;
  }
  dot.diameter =
      static_cast<std::uint8_t>(std::min<std::uint32_t>(style.car_size, kMaximumDiameter));
  dot.rgb = car_color(style, car);
  if (car.pit) {
    if (painted(style.pit_car_rgb)) {
      dot.rgb = style.pit_car_rgb;
    } else {
      dot.opa = LV_OPA_50;
    }
  }
  return dot;
}

[[nodiscard]] lv_area_t dot_area(const Dot& dot, const lv_area_t& origin) {
  const std::int32_t left = origin.x1 + dot.x - dot.diameter / 2;
  const std::int32_t top = origin.y1 + dot.y - dot.diameter / 2;
  return {left, top, left + dot.diameter - 1, top + dot.diameter - 1};
}

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

bool cars_area(const std::span<const Dot> dots, const lv_area_t& origin, lv_area_t& area) {
  if (dots.empty()) {
    return false;
  }
  area = {std::numeric_limits<std::int32_t>::max(), std::numeric_limits<std::int32_t>::max(),
          std::numeric_limits<std::int32_t>::min(), std::numeric_limits<std::int32_t>::min()};
  for (const Dot& dot : dots) {
    const lv_area_t box = dot_area(dot, origin);
    area.x1 = std::min(area.x1, box.x1 - 1);
    area.y1 = std::min(area.y1, box.y1 - 1);
    area.x2 = std::max(area.x2, box.x2 + 1);
    area.y2 = std::max(area.y2, box.y2 + 1);
  }
  return true;
}

void draw_cars(lv_event_t* const event) {
  const auto& state = *static_cast<const State*>(lv_event_get_user_data(event));
  lv_layer_t* const layer = lv_event_get_layer(event);
  if (layer == nullptr || state.canvas == nullptr || state.dot_count == 0) {
    return;
  }
  lv_area_t origin{};
  lv_obj_get_coords(state.canvas, &origin);
  lv_draw_rect_dsc_t descriptor;
  lv_draw_rect_dsc_init(&descriptor);
  descriptor.radius = LV_RADIUS_CIRCLE;
  for (std::size_t index = 0; index < state.dot_count; ++index) {
    const Dot& dot = state.dots[index];
    descriptor.bg_color = lv_color_hex(dot.rgb);
    descriptor.bg_opa = dot.opa;
    const bool ringed = painted(dot.border_rgb);
    descriptor.border_width = ringed ? 1 : 0;
    descriptor.border_color = lv_color_hex(ringed ? dot.border_rgb : dot.rgb);
    descriptor.border_opa = ringed ? LV_OPA_COVER : LV_OPA_TRANSP;
    const lv_area_t area = dot_area(dot, origin);
    lv_draw_rect(layer, &descriptor, &area);
  }
}

}
