#include <algorithm>
#include <cmath>
#include <cstdint>

#include "application_configuration.hpp"
#include "track_map_drawing.hpp"
#include "track_map_projection.hpp"

namespace pitrig::dashboard::track_map_widget::drawing {
namespace {

constexpr std::size_t kLinesPerLayer = 48;
constexpr std::int32_t kFinishOverhangPx = 8;
constexpr std::int32_t kMinimumFinishWidthPx = 2;
constexpr float kMinimumDirection = 0.001F;

class LineBatch final {
 public:
  explicit LineBatch(lv_obj_t* const canvas) : canvas_(canvas) {
    lv_canvas_init_layer(canvas_, &layer_);
  }
  ~LineBatch() { lv_canvas_finish_layer(canvas_, &layer_); }

  LineBatch(const LineBatch&) = delete;
  LineBatch& operator=(const LineBatch&) = delete;

  void line(const ScreenPoint from, const ScreenPoint to, const std::int32_t width,
            const std::uint32_t rgb) {
    lv_draw_line_dsc_t descriptor;
    lv_draw_line_dsc_init(&descriptor);
    descriptor.color = lv_color_hex(rgb);
    descriptor.width = width;
    descriptor.opa = LV_OPA_COVER;
    descriptor.round_start = 1;
    descriptor.round_end = 1;
    descriptor.p1 = {static_cast<lv_value_precise_t>(from.x),
                     static_cast<lv_value_precise_t>(from.y)};
    descriptor.p2 = {static_cast<lv_value_precise_t>(to.x), static_cast<lv_value_precise_t>(to.y)};
    lv_draw_line(&layer_, &descriptor);
    if (++drawn_ % kLinesPerLayer == 0) {
      lv_canvas_finish_layer(canvas_, &layer_);
      lv_canvas_init_layer(canvas_, &layer_);
    }
  }

 private:
  lv_obj_t* canvas_{};
  lv_layer_t layer_{};
  std::size_t drawn_{};
};

[[nodiscard]] std::uint32_t track_color(const State& state, const std::size_t sector) {
  if (state.override_rgb != configuration::kTransparentColor) {
    return state.override_rgb;
  }
  if (state.projection.sector_count == 0) {
    return state.style.line_rgb;
  }
  const std::uint32_t rgb = state.style.sector_rgb[sector % kSectorColors];
  return rgb == configuration::kTransparentColor ? state.style.line_rgb : rgb;
}

void draw_pit_lane(LineBatch& batch, const State& state) {
  const Projection& projection = state.projection;
  if (state.style.pit_lane_rgb == configuration::kTransparentColor || projection.pit_count < 2) {
    return;
  }
  const std::int32_t width = std::max<std::int32_t>(state.style.line_width / 2, 1);
  for (std::size_t index = 0; index + 1 < projection.pit_count; ++index) {
    batch.line(projection.pit[index], projection.pit[index + 1], width, state.style.pit_lane_rgb);
  }
}

void draw_track(LineBatch& batch, const State& state) {
  const Projection& projection = state.projection;
  const std::size_t count = projection.track_count;
  for (std::size_t index = 0; index < count; ++index) {
    const auto fraction = static_cast<std::uint32_t>(index * track_map::kLapUnits / count);
    const std::uint32_t rgb = track_color(state, projection::sector_of(projection, fraction));
    batch.line(projection.track[index], projection.track[(index + 1) % count],
               state.style.line_width, rgb);
  }
}

void draw_finish(LineBatch& batch, const State& state) {
  const Projection& projection = state.projection;
  if (state.style.finish_rgb == configuration::kTransparentColor || projection.track_count == 0) {
    return;
  }
  const std::uint32_t step = track_map::kLapUnits / projection.track_count + 1;
  const ScreenPoint center = projection::on_track(projection, projection.finish);
  const ScreenPoint before = projection::on_track(projection, projection.finish - step);
  const ScreenPoint after = projection::on_track(projection, projection.finish + step);
  const float along_x = after.x - before.x;
  const float along_y = after.y - before.y;
  const float length = std::hypot(along_x, along_y);
  if (length < kMinimumDirection) {
    return;
  }
  const float half =
      static_cast<float>(2 * state.style.line_width + kFinishOverhangPx) / 2.0F;
  const float across_x = -along_y / length * half;
  const float across_y = along_x / length * half;
  const std::int32_t width =
      std::max<std::int32_t>(state.style.line_width / 2, kMinimumFinishWidthPx);
  const ScreenPoint inside{center.x - across_x, center.y - across_y};
  const ScreenPoint outside{center.x + across_x, center.y + across_y};
  batch.line(inside, outside, width, state.style.finish_rgb);
}

}

void draw_outline(const State& state) {
  lv_canvas_fill_bg(state.canvas, lv_color_hex(state.background_rgb), LV_OPA_COVER);
  LineBatch batch{state.canvas};
  draw_pit_lane(batch, state);
  draw_track(batch, state);
  draw_finish(batch, state);
}

}
