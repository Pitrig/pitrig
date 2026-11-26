#pragma once

#include <algorithm>
#include <bit>
#include <cmath>
#include <cstddef>
#include <cstdint>

#include "application_configuration.hpp"
#include "graph_plot.hpp"
#include "graph_widget.hpp"

namespace pitrig::dashboard::graph_widget::raster {

inline constexpr float kHalfPixel = 0.5F;
inline constexpr float kFlat = 1.0e-3F;
inline constexpr float kBandMargin = 0.5F;
inline constexpr float kContestMargin = 0.25F;
inline constexpr std::uint32_t kRootMagic = 0x5f3759dfU;

struct Geometry {
  float step;
  float inverse_step;
  float radius;
};

struct Line {
  const float* ys;
  const std::uint32_t* rgbs;
  std::uint32_t color;
  std::int32_t ring;
  std::int32_t newest;
  std::int32_t count;
  float newest_x;
  float width;
  std::int32_t slots;
  std::int32_t newest_slot;
  std::int32_t copies;
};

struct Piece {
  float ax;
  float ay;
  float bx;
  float by;
  float run;
  float rise;
  float squared_length;
  float inverse_length;
  float run_per_rise;
  float half_band;
  float own_a;
  float own_b;
  float older_x;
  float older_y;
  float newer_x;
  float newer_y;
  bool clip_a;
  bool clip_b;
  bool contest_a;
  bool contest_b;
  std::uint32_t pixel;
};

[[nodiscard]] inline std::int32_t ceil_int(const float value) {
  const auto truncated = static_cast<std::int32_t>(value);
  return value > static_cast<float>(truncated) ? truncated + 1 : truncated;
}

[[nodiscard]] inline std::int32_t floor_int(const float value) {
  const auto truncated = static_cast<std::int32_t>(value);
  return value < static_cast<float>(truncated) ? truncated - 1 : truncated;
}

[[nodiscard, gnu::always_inline]] inline float inverse_root(const float value) {
  const std::uint32_t bits = kRootMagic - (std::bit_cast<std::uint32_t>(value) >> 1U);
  const auto estimate = std::bit_cast<float>(bits);
  const float refined = estimate * (1.5F - 0.5F * value * estimate * estimate);
  return refined * (1.5F - 0.5F * value * refined * refined);
}

[[nodiscard, gnu::always_inline]] inline float reciprocal(const float value) {
  const float magnitude = inverse_root(value * value);
  return value < 0.0F ? -magnitude : magnitude;
}

[[nodiscard, gnu::always_inline]] inline float root(const float value) {
  return value > 0.0F ? value * inverse_root(value) : 0.0F;
}

[[nodiscard]] inline Line line_of(const State& state, const std::size_t index) {
  Line line{state.history->y[index].data(),
            state.history->line_rgb.data(),
            state.traces[index].color,
            state.points,
            state.newest,
            state.stored,
            static_cast<float>(state.plot_width) - kHalfPixel,
            static_cast<float>(state.plot_width),
            state.points - 1,
            0,
            1};
  if (state.sweep) {
    line.count = std::min<std::int32_t>(state.stored, plot::sweep_oldest_age(state) + 1);
    line.newest_x = plot::sweep_x(state, state.sequence);
    line.newest_slot = static_cast<std::int32_t>((state.sequence - 1) % (state.points - 1U));
    line.copies = 2;
  }
  return line;
}

[[nodiscard]] inline std::int32_t index_of(const Line& line, const std::int32_t age) {
  const std::int32_t index = line.newest - age;
  return index < 0 ? index + line.ring : index;
}

[[nodiscard, gnu::always_inline]] inline float x_of(const Line& line, const Geometry& geometry,
                                                    const std::int32_t copy,
                                                    const std::int32_t age) {
  if (line.copies == 1) {
    return line.newest_x - static_cast<float>(age) * geometry.step;
  }
  const bool wrapped = age > line.newest_slot;
  const std::int32_t slot = wrapped ? line.newest_slot - age + line.slots : line.newest_slot - age;
  const float x = static_cast<float>(slot) * geometry.step + kHalfPixel;
  return x + static_cast<float>(copy - (wrapped ? 1 : 0)) * line.width;
}

struct Joint {
  float slope;
  bool contested;
};

[[nodiscard, gnu::always_inline]] inline Joint joint_of(const float run, const float rise,
                                                        const float other_run,
                                                        const float other_rise,
                                                        const float neighbour, const float reach) {
  const float inverse = inverse_root(run * run + rise * rise);
  const float other = inverse_root(other_run * other_run + other_rise * other_rise);
  const float sum_x = run * inverse + other_run * other;
  const float apart_y = other_rise * other - rise * inverse;
  const float slope = std::fabs(apart_y) > sum_x
                          ? (run * inverse - other_run * other) * reciprocal(apart_y)
                          : (rise * inverse + other_rise * other) * reciprocal(sum_x);
  const float turn = 1.0F + (run * other_run + rise * other_rise) * inverse * other;
  return {slope, neighbour * turn < 2.0F * reach * reach};
}

template <typename Format>
[[nodiscard]] Piece piece_of(const Line& line, const Geometry& geometry, const std::int32_t copy,
                             const std::int32_t age) {
  Piece piece{};
  const float start_y = line.ys[index_of(line, age + 1)];
  const float end_y = line.ys[index_of(line, age)];
  piece.ax = x_of(line, geometry, copy, age + 1);
  piece.bx = x_of(line, geometry, copy, age);
  piece.ay = start_y;
  piece.by = end_y;
  piece.run = piece.bx - piece.ax;
  piece.rise = end_y - start_y;
  piece.squared_length = piece.run * piece.run + piece.rise * piece.rise;
  piece.inverse_length = inverse_root(piece.squared_length);
  if (std::fabs(piece.rise) > kFlat) {
    const float inverse_rise = reciprocal(piece.rise);
    piece.run_per_rise = piece.run * inverse_rise;
    piece.half_band = geometry.radius * piece.squared_length * piece.inverse_length *
                      std::fabs(inverse_rise) + kBandMargin;
  }
  const float reach = geometry.radius + kContestMargin;
  piece.clip_a = age + 2 < line.count;
  if (piece.clip_a) {
    piece.older_x = x_of(line, geometry, copy, age + 2);
    piece.older_y = line.ys[index_of(line, age + 2)];
    const float older_run = piece.ax - piece.older_x;
    const float older_rise = start_y - piece.older_y;
    const Joint joint = joint_of(older_run, older_rise, piece.run, piece.rise,
                                 older_run * older_run + older_rise * older_rise, reach);
    piece.own_a = joint.slope;
    piece.contest_a = joint.contested;
  }
  piece.clip_b = age > 0;
  if (piece.clip_b) {
    piece.newer_x = x_of(line, geometry, copy, age - 1);
    piece.newer_y = line.ys[index_of(line, age - 1)];
    const float newer_run = piece.newer_x - piece.bx;
    const float newer_rise = piece.newer_y - end_y;
    const Joint joint = joint_of(piece.run, piece.rise, newer_run, newer_rise,
                                 newer_run * newer_run + newer_rise * newer_rise, reach);
    piece.own_b = joint.slope;
    piece.contest_b = joint.contested;
  }
  const std::uint32_t rgb = line.rgbs[index_of(line, age)];
  piece.pixel = Format::pack(rgb == configuration::kTransparentColor ? line.color : rgb);
  return piece;
}

}
