#include <algorithm>
#include <cmath>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "lvgl.h"
#include "track_map_drawing.hpp"
#include "track_map_projection.hpp"
#include "track_map_raster.hpp"

namespace pitrig::dashboard::track_map_widget::drawing {
namespace {

constexpr float kMarkOverhangPx = 8.0F;
constexpr float kMinimumFinishWidthPx = 2.0F;
constexpr float kMinimumLineWidthPx = 1.0F;
constexpr float kMinimumDirection = 0.001F;

[[nodiscard]] bool painted(const std::uint32_t rgb) {
  return rgb != configuration::kTransparentColor;
}

void draw_line(raster::Layer& layer, const std::span<const ScreenPoint> points, const bool closed,
               const float width) {
  for (std::size_t index = 0; index + 1 < points.size(); ++index) {
    layer.segment(points[index], points[index + 1], width);
  }
  if (closed && points.size() > 2) {
    layer.segment(points.back(), points.front(), width);
  }
}

void draw_mark(raster::Layer& layer, const Projection& projection, const std::uint32_t fraction,
               const float length, const float width) {
  const auto step = static_cast<float>(track_map::kLapUnits / projection.track_count + 1);
  const auto at = static_cast<float>(fraction);
  const ScreenPoint center = projection::on_track(projection, at);
  const ScreenPoint before = projection::on_track(projection, at - step);
  const ScreenPoint after = projection::on_track(projection, at + step);
  const float along_x = after.x - before.x;
  const float along_y = after.y - before.y;
  const float span = std::hypot(along_x, along_y);
  if (span < kMinimumDirection) {
    return;
  }
  const float across_x = -along_y / span * length / 2.0F;
  const float across_y = along_x / span * length / 2.0F;
  layer.segment({center.x - across_x, center.y - across_y},
                {center.x + across_x, center.y + across_y}, width);
}

}

void draw_outline(const State& state) {
  lv_draw_buf_t* const buffer = lv_canvas_get_draw_buf(state.canvas);
  if (buffer == nullptr || buffer->data == nullptr) {
    return;
  }
  const auto stride = static_cast<std::int32_t>(buffer->header.stride / sizeof(std::uint16_t));
  const std::span<std::uint16_t> pixels{reinterpret_cast<std::uint16_t*>(buffer->data),
                                        static_cast<std::size_t>(stride * state.height)};
  raster::fill(pixels, stride, state.width, state.height, state.background_rgb);
  const auto area = static_cast<std::size_t>(state.width * state.height);
  auto* const coverage = static_cast<std::uint8_t*>(lv_malloc_zeroed(area));
  if (coverage != nullptr) {
    raster::Layer layer{pixels, stride, state.width, state.height, {coverage, area}};
    const Projection& projection = state.projection;
    const Style& style = state.style;
    const auto line = static_cast<float>(style.line_width);
    const float mark_length = 2.0F * line + kMarkOverhangPx;
    if (painted(style.pit_lane_rgb) && projection.pit_count >= 2) {
      draw_line(layer, {projection.pit.data(), projection.pit_count}, false,
                std::max(line / 2.0F, kMinimumLineWidthPx));
      layer.paint(style.pit_lane_rgb);
    }
    draw_line(layer, {projection.track.data(), projection.track_count}, true, line);
    layer.paint(painted(state.override_rgb) ? state.override_rgb : style.line_rgb);
    if (painted(style.sector_mark_rgb) && projection.sector_count > 0) {
      for (std::size_t index = 0; index < projection.sector_count; ++index) {
        draw_mark(layer, projection, projection.sector_starts[index], mark_length,
                  std::max(line / 4.0F, kMinimumLineWidthPx));
      }
      layer.paint(style.sector_mark_rgb);
    }
    if (painted(style.finish_rgb) && projection.track_count > 0) {
      draw_mark(layer, projection, projection.finish, mark_length,
                std::max(line / 2.0F, kMinimumFinishWidthPx));
      layer.paint(style.finish_rgb);
    }
    lv_free(coverage);
  }
  lv_draw_buf_flush_cache(buffer, nullptr);
}

}
