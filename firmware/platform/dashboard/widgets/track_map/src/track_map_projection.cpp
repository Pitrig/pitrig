#include "track_map_projection.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

#include "application_configuration.hpp"

namespace pitrig::dashboard::track_map_widget::projection {
namespace {

constexpr int kAngleStepDeg = 5;
constexpr int kAngleSteps = 36;
constexpr int kFullTurnDeg = 360;
constexpr std::size_t kRingPoints = 128;
constexpr float kPi = 3.14159265358979F;
constexpr float kTieTolerance = 1.0e-5F;
constexpr std::uint32_t kLapMask = track_map::kLapUnits - 1;

struct Bounds {
  float min_x{std::numeric_limits<float>::max()};
  float max_x{std::numeric_limits<float>::lowest()};
  float min_y{std::numeric_limits<float>::max()};
  float max_y{std::numeric_limits<float>::lowest()};
};

struct Turn {
  float cosine{1.0F};
  float sine{};
};

[[nodiscard]] Turn turn_of(const int degrees) {
  const float radians = static_cast<float>(degrees % kFullTurnDeg) * kPi / 180.0F;
  return {std::cos(radians), std::sin(radians)};
}

[[nodiscard]] ScreenPoint turned(const track_map::Point point, const Turn turn) {
  const auto x = static_cast<float>(point.x);
  const auto y = static_cast<float>(point.y);
  return {x * turn.cosine - y * turn.sine, x * turn.sine + y * turn.cosine};
}

[[nodiscard]] Bounds bounds_at(const track_map::Outline& outline, const Turn turn) {
  Bounds bounds{};
  const auto include = [&](const track_map::Point point) {
    const ScreenPoint place = turned(point, turn);
    bounds.min_x = std::min(bounds.min_x, place.x);
    bounds.max_x = std::max(bounds.max_x, place.x);
    bounds.min_y = std::min(bounds.min_y, place.y);
    bounds.max_y = std::max(bounds.max_y, place.y);
  };
  std::for_each_n(outline.track.begin(), outline.track_count, include);
  std::for_each_n(outline.pit.begin(), outline.pit_count, include);
  return bounds;
}

[[nodiscard]] float scale_of(const Bounds& bounds, const float width, const float height) {
  const float span_x = std::max(bounds.max_x - bounds.min_x, 1.0F);
  const float span_y = std::max(bounds.max_y - bounds.min_y, 1.0F);
  return std::min(width / span_x, height / span_y);
}

[[nodiscard]] int best_angle(const track_map::Outline& outline, const Fit& fit, const float width,
                             const float height) {
  int best = 0;
  float best_scale = -1.0F;
  const int steps = fit.fit_rotation ? kAngleSteps : 1;
  for (int step = 0; step < steps; ++step) {
    const int degrees = step * kAngleStepDeg;
    const float scale = scale_of(bounds_at(outline, turn_of(degrees)), width, height);
    if (scale > best_scale * (1.0F + kTieTolerance)) {
      best_scale = scale;
      best = degrees;
    }
  }
  return best;
}

void project_ring(const Fit& fit, const float width, const float height, Projection& projection) {
  const float radius = std::min(width, height) / 2.0F;
  const float center_x = static_cast<float>(fit.width) / 2.0F;
  const float center_y = static_cast<float>(fit.height) / 2.0F;
  for (std::size_t index = 0; index < kRingPoints; ++index) {
    const float angle =
        -kPi / 2.0F + 2.0F * kPi * static_cast<float>(index) / static_cast<float>(kRingPoints);
    projection.track[index] = {center_x + radius * std::cos(angle),
                               center_y + radius * std::sin(angle)};
  }
  projection.track_count = kRingPoints;
  projection.pit_count = 0;
  projection.pit_from = 0;
  projection.pit_to = 0;
  projection.finish = 0;
  projection.sector_count = 0;
}

}

float margin(const Style& style) {
  const auto player =
      static_cast<std::uint16_t>(style.player_border_rgb == configuration::kTransparentColor
                                     ? style.player_size
                                     : style.player_size + 2);
  const std::uint16_t widest = std::max({style.line_width, style.car_size, player});
  return static_cast<float>(widest) / 2.0F + 1.0F;
}

void project(const track_map::Outline& outline, const Fit& fit, Projection& projection) {
  const float width = std::max(static_cast<float>(fit.width) - 2.0F * fit.margin, 1.0F);
  const float height = std::max(static_cast<float>(fit.height) - 2.0F * fit.margin, 1.0F);
  if (outline.track_count < 3) {
    project_ring(fit, width, height, projection);
    return;
  }
  const Turn turn = turn_of(best_angle(outline, fit, width, height) + fit.rotation_deg);
  const Bounds bounds = bounds_at(outline, turn);
  const float scale = scale_of(bounds, width, height);
  const float offset_x =
      static_cast<float>(fit.width) / 2.0F - (bounds.min_x + bounds.max_x) / 2.0F * scale;
  const float offset_y =
      static_cast<float>(fit.height) / 2.0F - (bounds.min_y + bounds.max_y) / 2.0F * scale;
  const auto place = [&](const track_map::Point point) {
    const ScreenPoint rotated = turned(point, turn);
    return ScreenPoint{rotated.x * scale + offset_x, rotated.y * scale + offset_y};
  };
  std::transform(outline.track.begin(), outline.track.begin() + outline.track_count,
                 projection.track.begin(), place);
  std::transform(outline.pit.begin(), outline.pit.begin() + outline.pit_count,
                 projection.pit.begin(), place);
  projection.track_count = outline.track_count;
  projection.pit_count = outline.pit_count;
  projection.pit_from = outline.pit_from;
  projection.pit_to = outline.pit_to;
  projection.finish = outline.finish;
  projection.sector_count = outline.sector_count;
  projection.sector_starts = outline.sector_starts;
}

ScreenPoint on_track(const Projection& projection, const std::uint32_t fraction) {
  const std::size_t count = projection.track_count;
  if (count == 0) {
    return {};
  }
  const float position = static_cast<float>(fraction & kLapMask) * static_cast<float>(count) /
                         static_cast<float>(track_map::kLapUnits);
  const auto index = static_cast<std::size_t>(position);
  const float share = position - static_cast<float>(index);
  const ScreenPoint from = projection.track[index % count];
  const ScreenPoint to = projection.track[(index + 1) % count];
  return {from.x + (to.x - from.x) * share, from.y + (to.y - from.y) * share};
}

bool on_pit_lane(const Projection& projection, const std::uint32_t fraction, ScreenPoint& point) {
  if (projection.pit_count < 2) {
    return false;
  }
  const std::uint32_t span = (projection.pit_to - projection.pit_from) & kLapMask;
  const std::uint32_t offset = (fraction - projection.pit_from) & kLapMask;
  if (span == 0 || offset > span) {
    return false;
  }
  const float position = static_cast<float>(offset) / static_cast<float>(span) *
                         static_cast<float>(projection.pit_count - 1);
  const auto last_segment = static_cast<std::size_t>(projection.pit_count - 2);
  const auto index = std::min(static_cast<std::size_t>(position), last_segment);
  const float share = position - static_cast<float>(index);
  const ScreenPoint from = projection.pit[index];
  const ScreenPoint to = projection.pit[index + 1];
  point = {from.x + (to.x - from.x) * share, from.y + (to.y - from.y) * share};
  return true;
}

std::size_t sector_of(const Projection& projection, const std::uint32_t fraction) {
  const std::uint32_t relative = (fraction - projection.finish) & kLapMask;
  std::size_t sector = 0;
  for (std::size_t index = 0; index < projection.sector_count; ++index) {
    if (((projection.sector_starts[index] - projection.finish) & kLapMask) <= relative) {
      ++sector;
    }
  }
  return sector;
}

}
