#include "graph_plot.hpp"

#include <algorithm>
#include <cmath>

#include "application_configuration.hpp"

namespace pitrig::dashboard::graph_widget::plot {
namespace {

constexpr float kHalfPixel = 0.5F;
constexpr float kMargin = 1.0F;

void invalidate_columns(const State& state, const std::int32_t from, const std::int32_t to) {
  lv_area_t coords;
  lv_obj_get_coords(state.plot, &coords);
  const std::int32_t first = (from % state.plot_width + state.plot_width) % state.plot_width;
  const std::int32_t last = first + (to - from);
  const lv_area_t area{coords.x1 + first, coords.y1,
                       coords.x1 + std::min(last, state.plot_width - 1), coords.y2};
  lv_obj_invalidate_area(state.plot, &area);
  if (last >= state.plot_width) {
    const lv_area_t wrapped{coords.x1, coords.y1, coords.x1 + last - state.plot_width, coords.y2};
    lv_obj_invalidate_area(state.plot, &wrapped);
  }
}

}

std::int32_t line_reserve(const std::uint16_t line_width_px) {
  return (static_cast<std::int32_t>(line_width_px) + 1) / 2;
}

float sample_y(const std::int32_t plot_height, const float fraction) {
  const float y = static_cast<float>(plot_height) * (1.0F - fraction);
  return std::clamp<float>(y, 0.0F, static_cast<float>(plot_height));
}

float line_radius(const State& state) {
  return static_cast<float>(state.line_width_px) / 2.0F + kHalfPixel;
}

std::int32_t sweep_oldest_age(const State& state) {
  const float shown = static_cast<float>(state.plot_width - state.sweep_gap);
  return std::max<std::int32_t>(1, static_cast<std::int32_t>(shown / state.step_px));
}

float sweep_x(const State& state, const std::uint32_t sequence) {
  const std::uint32_t slots = static_cast<std::uint32_t>(state.points) - 1;
  const std::uint32_t slot = sequence == 0 ? 0 : (sequence - 1) % slots;
  return static_cast<float>(slot) * state.step_px + kHalfPixel;
}

void invalidate(const State& state, const std::uint32_t previous_sequence) {
  const std::uint32_t added = state.sequence - previous_sequence;
  if (!state.sweep || previous_sequence == 0 ||
      added >= static_cast<std::uint32_t>(state.points) - 1) {
    lv_obj_invalidate(state.plot);
    return;
  }
  const float reach = line_radius(state) + kHalfPixel + kMargin;
  const float hidden = static_cast<float>(state.plot_width) -
                       static_cast<float>(sweep_oldest_age(state)) * state.step_px;
  const float from = sweep_x(state, previous_sequence) - reach;
  const float to = from + static_cast<float>(added) * state.step_px + hidden + 2.0F * reach;
  if (to - from >= static_cast<float>(state.plot_width)) {
    lv_obj_invalidate(state.plot);
    return;
  }
  invalidate_columns(state, static_cast<std::int32_t>(std::floor(from)),
                     static_cast<std::int32_t>(std::ceil(to)));
}

}
