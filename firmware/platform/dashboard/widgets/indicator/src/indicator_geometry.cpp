#include "indicator_geometry.hpp"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <limits>
#include <numbers>

namespace simcore::dashboard::indicator_widget::geometry {
namespace {

constexpr float kDegreesPerRadian = 180.0F / std::numbers::pi_v<float>;

[[nodiscard]] std::int32_t normalized_degrees(const std::int32_t degrees) {
  const std::int32_t wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

}

Ring resolve_ring(const Config& config, const std::int32_t inner_width,
                  const std::int32_t inner_height) {
  const float thickness = static_cast<float>(config.thickness_px);
  const float fitted =
      static_cast<float>(std::min(inner_width, inner_height)) / 2.0F -
      thickness / 2.0F;
  const float radius = config.radius_px != 0
                           ? static_cast<float>(config.radius_px)
                           : fitted;
  const float centre_x = static_cast<float>(inner_width) / 2.0F +
                         static_cast<float>(config.center_x_px);
  const float centre_y = static_cast<float>(inner_height) / 2.0F +
                         static_cast<float>(config.center_y_px);
  return Ring{radius, static_cast<std::int32_t>(std::lround(centre_x)),
              static_cast<std::int32_t>(std::lround(centre_y))};
}

ArcSlices resolve_arc(const Config& config, const float radius,
                      const std::int32_t count) {
  if (radius <= 0.0F || count <= 0) {
    return {};
  }
  const float wanted_gap =
      static_cast<float>(config.segment_gap_px) * kDegreesPerRadian / radius;
  const auto sweep = static_cast<std::int32_t>(config.sweep_deg);
  const std::int32_t smallest_gap = config.segment_gap_px != 0 ? 1 : 0;
  const std::int32_t gap = std::max(
      static_cast<std::int32_t>(std::lround(wanted_gap)), smallest_gap);
  const std::int32_t spent = gap * (count - 1);
  const float exact =
      static_cast<float>(sweep - spent) / static_cast<float>(count);
  if (exact < 0.5F) {
    return {};
  }
  const auto shortest =
      std::max<std::int32_t>(static_cast<std::int32_t>(std::floor(exact)), 1);
  ArcSlices best{};
  std::int32_t best_total{};
  std::int32_t best_error = std::numeric_limits<std::int32_t>::max();
  for (std::int32_t length = shortest; length <= shortest + 1; ++length) {
    const std::int32_t total = length * count + spent;
    if (total > 360) {
      continue;
    }
    const std::int32_t error = std::abs(sweep - total);
    if (error > best_error || (error == best_error && total >= best_total)) {
      continue;
    }
    best_error = error;
    best_total = total;
    best = ArcSlices{0, length, gap};
  }
  if (best.length_deg == 0) {
    return {};
  }
  best.start_deg =
      normalized_degrees(static_cast<std::int32_t>(config.start_angle_deg) +
                         (sweep - best_total) / 2);
  return best;
}

std::size_t slot_of(const State& state, const std::size_t index) {
  return state.inverted ? state.segment_count - 1 - index : index;
}

std::int32_t lamp_start_deg(const State& state, const std::size_t index) {
  return state.arc_start_deg + static_cast<std::int32_t>(slot_of(state, index)) *
                                   (state.arc_length_deg + state.arc_gap_deg);
}

std::uint16_t outer_radius(const State& state) {
  return static_cast<std::uint16_t>(std::lround(
      state.ring_radius + static_cast<float>(state.thickness) / 2.0F));
}

lv_area_t lamp_area(const State& state, const std::size_t index,
                    const lv_area_t& content) {
  const auto offset = static_cast<std::int32_t>(slot_of(state, index)) *
                      (state.lamp_length + state.lamp_gap);
  if (state.horizontal) {
    const std::int32_t left = content.x1 + offset;
    return {left, content.y1, left + state.lamp_length - 1, content.y2};
  }
  const std::int32_t bottom = content.y2 - offset;
  return {content.x1, bottom - state.lamp_length + 1, content.x2, bottom};
}

lv_area_t lamp_arc_area(const State& state, const std::size_t index,
                        const lv_area_t& content) {
  lv_area_t area{};
  const std::int32_t start = lamp_start_deg(state, index);
  lv_draw_arc_get_area(
      content.x1 + state.ring_center_x, content.y1 + state.ring_center_y,
      outer_radius(state), static_cast<lv_value_precise_t>(start),
      static_cast<lv_value_precise_t>(start + state.arc_length_deg),
      state.thickness, state.rounded, &area);
  return area;
}

}
