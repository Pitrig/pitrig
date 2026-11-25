#include "graph_raster.hpp"

#include <algorithm>
#include <cmath>

#include "graph_pieces.hpp"
#include "graph_pixels.hpp"

namespace pitrig::dashboard::graph_widget::raster {
namespace {

struct Target {
  const Surface& surface;
  const Region& region;
  bool opaque;
  float amount;
};

template <typename Format>
[[nodiscard]] std::uint8_t* address(const Target& target, const std::int32_t x,
                                    const std::int32_t y) {
  return target.surface.pixels + (y + target.surface.origin_y) * target.surface.stride +
         (x + target.surface.origin_x) * Format::kBytes;
}

template <typename Format>
[[gnu::always_inline]] inline void cover(const Target& target, std::uint8_t* const pixel,
                                         const std::uint32_t value, const float coverage) {
  if (coverage >= 1.0F && target.opaque) {
    Format::put(pixel, value);
  } else if (coverage > 0.0F) {
    Format::blend(pixel, value,
                  static_cast<std::uint8_t>(std::min(coverage, 1.0F) * target.amount + kHalfPixel));
  }
}

[[nodiscard]] inline float squared(const float x, const float y) { return x * x + y * y; }

[[nodiscard]] inline float squared_distance(const Piece& piece, const float x, const float y) {
  const float along = ((x - piece.ax) * piece.run + (y - piece.ay) * piece.rise) *
                      piece.inverse_length * piece.inverse_length;
  const float share = std::clamp(along, 0.0F, 1.0F);
  return squared(x - piece.ax - share * piece.run, y - piece.ay - share * piece.rise);
}

[[nodiscard]] inline float past_older(const Piece& piece, const float x, const float y) {
  return (x - piece.older_x) * (piece.older_x - piece.ax) +
         (y - piece.older_y) * (piece.older_y - piece.ay);
}

[[nodiscard]] inline float past_newer(const Piece& piece, const float x, const float y) {
  return (x - piece.newer_x) * (piece.newer_x - piece.bx) +
         (y - piece.newer_y) * (piece.newer_y - piece.by);
}

template <typename Format>
[[gnu::noinline]] void contest_older(const Target& target, const Geometry& geometry,
                                     const Piece& piece, const std::int32_t row,
                                     const std::int32_t from, const std::int32_t to,
                                     const std::int32_t last) {
  if (from > to) {
    return;
  }
  const float y = static_cast<float>(row) + kHalfPixel;
  std::uint8_t* cursor = address<Format>(target, from, row);
  for (std::int32_t column = from; column <= to; ++column, cursor += Format::kBytes) {
    const float x = static_cast<float>(column) + kHalfPixel;
    if (past_older(piece, x, y) <= 0.0F) {
      return;
    }
    const float own = squared_distance(piece, x, y);
    if (own < squared(x - piece.older_x, y - piece.older_y) &&
        (column <= last ||
         (past_newer(piece, x, y) > 0.0F && own < squared(x - piece.newer_x, y - piece.newer_y)))) {
      cover<Format>(target, cursor, piece.pixel, geometry.radius - root(own));
    }
  }
}

template <typename Format>
[[gnu::noinline]] void contest_newer(const Target& target, const Geometry& geometry,
                                     const Piece& piece, const std::int32_t row,
                                     const std::int32_t from, const std::int32_t to) {
  if (from > to) {
    return;
  }
  const float y = static_cast<float>(row) + kHalfPixel;
  std::uint8_t* cursor = address<Format>(target, to, row);
  for (std::int32_t column = to; column >= from; --column, cursor -= Format::kBytes) {
    const float x = static_cast<float>(column) + kHalfPixel;
    if (past_newer(piece, x, y) <= 0.0F) {
      return;
    }
    const float own = squared_distance(piece, x, y);
    if (own < squared(x - piece.newer_x, y - piece.newer_y)) {
      cover<Format>(target, cursor, piece.pixel, geometry.radius - root(own));
    }
  }
}

template <typename Format>
[[gnu::always_inline]] inline void draw_row(const Target& target, const Geometry& geometry,
                                            const Piece& piece, const std::int32_t row) {
  const float radius = geometry.radius;
  const float row_center = static_cast<float>(row) + kHalfPixel;
  const float rise_y = row_center - piece.ay;
  const float end_rise_y = row_center - piece.by;
  float band_left = piece.ax - radius;
  float band_right = piece.bx + radius;
  if (piece.half_band > 0.0F) {
    const float center = piece.ax + rise_y * piece.run_per_rise;
    band_left = std::max(band_left, center - piece.half_band);
    band_right = std::min(band_right, center + piece.half_band);
  }
  float left = band_left;
  float right = band_right;
  if (piece.clip_a) {
    left = std::max(left, piece.ax - rise_y * piece.own_a);
  }
  if (piece.clip_b) {
    right = std::min(right, piece.bx - end_rise_y * piece.own_b);
  }
  const std::int32_t first = std::max(target.region.x1, ceil_int(left - kHalfPixel));
  const std::int32_t last = std::min(target.region.x2, ceil_int(right - kHalfPixel) - 1);
  if (piece.contest_a && left > band_left && past_older(piece, band_left, row_center) > 0.0F) {
    const std::int32_t band_last =
        std::min(target.region.x2, ceil_int(band_right - kHalfPixel) - 1);
    contest_older<Format>(target, geometry, piece, row,
                          std::max(target.region.x1, ceil_int(band_left - kHalfPixel)),
                          std::min(first - 1, band_last), last);
  }
  if (piece.contest_b && right < band_right &&
      past_newer(piece, band_right, row_center) > 0.0F) {
    contest_newer<Format>(target, geometry, piece, row, std::max(first, last + 1),
                          std::min(target.region.x2, ceil_int(band_right - kHalfPixel) - 1));
  }
  if (first > last) {
    return;
  }
  const float body_start = piece.ax - rise_y * piece.rise * geometry.inverse_step;
  const float body_end = body_start + piece.squared_length * geometry.inverse_step;
  const std::int32_t body_first = std::max(first, ceil_int(body_start - kHalfPixel));
  const std::int32_t body_last = std::min(last, floor_int(body_end - kHalfPixel));
  std::uint8_t* cursor = address<Format>(target, first, row);
  std::int32_t column = first;
  for (; column <= last && column < body_first; ++column, cursor += Format::kBytes) {
    const float run_x = static_cast<float>(column) + kHalfPixel - piece.ax;
    cover<Format>(target, cursor, piece.pixel, radius - root(run_x * run_x + rise_y * rise_y));
  }
  float cross = (static_cast<float>(column) + kHalfPixel - piece.ax) * piece.rise -
                rise_y * piece.run;
  for (; column <= body_last; ++column, cursor += Format::kBytes, cross += piece.rise) {
    cover<Format>(target, cursor, piece.pixel,
                  radius - std::fabs(cross) * piece.inverse_length);
  }
  for (; column <= last; ++column, cursor += Format::kBytes) {
    const float run_x = static_cast<float>(column) + kHalfPixel - piece.bx;
    cover<Format>(target, cursor, piece.pixel,
                  radius - root(run_x * run_x + end_rise_y * end_rise_y));
  }
}

template <typename Format>
void draw_line(const Target& target, const Geometry& geometry, const Line& line) {
  const float reach = geometry.radius + 1.0F;
  const float left = static_cast<float>(target.region.x1) - reach;
  const float right = static_cast<float>(target.region.x2 + 1) + reach;
  const float top = static_cast<float>(target.region.y1) - reach;
  const float bottom = static_cast<float>(target.region.y2 + 1) + reach;
  for (std::int32_t copy = 0; copy < line.copies; ++copy) {
    const float base = line.newest_x + static_cast<float>(copy) * line.width;
    const std::int32_t first =
        std::max<std::int32_t>(0, floor_int((base - right) * geometry.inverse_step) - 1);
    const std::int32_t last = std::min<std::int32_t>(
        line.count - 2, ceil_int((base - left) * geometry.inverse_step));
    for (std::int32_t age = first; age <= last; ++age) {
      const float start_y = line.ys[index_of(line, age + 1)];
      const float end_y = line.ys[index_of(line, age)];
      if (std::max(start_y, end_y) < top || std::min(start_y, end_y) > bottom) {
        continue;
      }
      const Piece piece = piece_of<Format>(line, geometry, copy, age);
      if (piece.bx < left || piece.ax > right) {
        continue;
      }
      const std::int32_t first_row = std::max(
          target.region.y1, floor_int(std::min(start_y, end_y) - geometry.radius - kHalfPixel));
      const std::int32_t last_row = std::min(
          target.region.y2, ceil_int(std::max(start_y, end_y) + geometry.radius - kHalfPixel));
      for (std::int32_t row = first_row; row <= last_row; ++row) {
        draw_row<Format>(target, geometry, piece, row);
      }
    }
  }
}

template <typename Format>
void fill(const Target& target, const std::uint32_t pixel) {
  const std::int32_t width = target.region.x2 - target.region.x1 + 1;
  for (std::int32_t y = target.region.y1; y <= target.region.y2; ++y) {
    std::uint8_t* cursor = address<Format>(target, target.region.x1, y);
    if (target.opaque) {
      Format::put_row(cursor, pixel, width);
      continue;
    }
    for (std::int32_t x = 0; x < width; ++x, cursor += Format::kBytes) {
      Format::blend(cursor, pixel, target.surface.opa);
    }
  }
}

template <typename Format>
void paint_as(const State& state, const Target& target) {
  fill<Format>(target, Format::pack(state.background_rgb));
  if (state.history == nullptr || state.stored < 2) {
    return;
  }
  const Geometry geometry{state.step_px, 1.0F / state.step_px, plot::line_radius(state)};
  for (std::size_t index = 0; index < state.trace_count; ++index) {
    draw_line<Format>(target, geometry, line_of(state, index));
  }
}

}

bool supports(const lv_color_format_t format) {
  return format == LV_COLOR_FORMAT_RGB565 || format == LV_COLOR_FORMAT_RGB888 ||
         format == LV_COLOR_FORMAT_XRGB8888 || format == LV_COLOR_FORMAT_ARGB8888;
}

void paint(const State& state, const Surface& surface, const Region& region) {
  const Target target{surface, region, surface.opa >= LV_OPA_MAX,
                      static_cast<float>(surface.opa)};
  switch (surface.format) {
    case LV_COLOR_FORMAT_RGB565:
      paint_as<pixels::Rgb565>(state, target);
      return;
    case LV_COLOR_FORMAT_RGB888:
      paint_as<pixels::Rgb888>(state, target);
      return;
    case LV_COLOR_FORMAT_XRGB8888:
      paint_as<pixels::Xrgb8888>(state, target);
      return;
    case LV_COLOR_FORMAT_ARGB8888:
      paint_as<pixels::Argb8888>(state, target);
      return;
    default:
      return;
  }
}

}
