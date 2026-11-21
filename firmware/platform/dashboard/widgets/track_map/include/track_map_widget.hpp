#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "lvgl.h"
#include "track_map.hpp"
#include "widget_collection.hpp"
#include "widget_frame.hpp"
#include "widget_source_binding.hpp"

namespace pitrig::dashboard::track_map_widget {

inline constexpr std::size_t kMaximumInstances = configuration::kMaximumTrackMapWidgets;
inline constexpr std::size_t kSectorColors = 3;
inline constexpr std::size_t kClassColors = 4;
inline constexpr std::size_t kRoleCount = 7;

using Config = configuration::TrackMapWidgetConfiguration;

struct ScreenPoint {
  float x{};
  float y{};
};

struct Projection {
  std::array<ScreenPoint, track_map::kMaximumTrackPoints> track{};
  std::array<ScreenPoint, track_map::kMaximumPitPoints> pit{};
  std::array<std::uint16_t, track_map::kMaximumSectorStarts> sector_starts{};
  std::uint16_t track_count{};
  std::uint16_t pit_count{};
  std::uint16_t pit_from{};
  std::uint16_t pit_to{};
  std::uint16_t finish{};
  std::uint8_t sector_count{};
};

struct Style {
  std::uint32_t line_rgb{};
  std::array<std::uint32_t, kSectorColors> sector_rgb{};
  std::uint32_t pit_lane_rgb{};
  std::uint32_t finish_rgb{};
  std::uint32_t car_rgb{};
  std::uint32_t player_rgb{};
  std::uint32_t player_border_rgb{};
  std::uint32_t pit_car_rgb{};
  std::array<std::uint32_t, kRoleCount> role_rgb{};
  std::array<std::uint32_t, kClassColors> class_rgb{};
  std::uint16_t line_width{};
  std::uint16_t car_size{};
  std::uint16_t player_size{};
  std::uint16_t rotation_deg{};
  std::uint16_t refresh_ms{};
  bool fit_rotation{};
};

struct Dot {
  std::int16_t x{};
  std::int16_t y{};
  std::uint32_t rgb{};
  std::uint32_t border_rgb{};
  std::uint8_t diameter{};
  lv_opa_t opa{};

  [[nodiscard]] bool operator==(const Dot&) const = default;
};

struct State {
  frame::Painter painter{};
  lv_obj_t* container{};
  lv_obj_t* canvas{};
  const track_map::Service* service{};
  Style style{};
  Projection projection{};
  std::array<Dot, track_map::kMaximumCars> dots{};
  std::size_t dot_count{};
  lv_area_t dots_area{};
  std::int32_t width{};
  std::int32_t height{};
  std::uint32_t background_rgb{};
  std::uint32_t override_rgb{};
  std::uint32_t generation{};
  std::uint32_t refreshed_at{};
  bool outline_dirty{};
  bool dots_shown{};
};

class Collection final : public frame::Collection<Collection, State, kMaximumInstances> {
 public:
  using Base = frame::Collection<Collection, State, kMaximumInstances>;

  [[nodiscard]] bool create(const Layout& layout, std::span<const Config> configurations,
                            std::span<const frame::ValueBinding> bindings,
                            const fonts::Registry& fonts, const track_map::Service* service);
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout, const Config& configuration,
                              const frame::ValueBinding& binding, const fonts::Registry& fonts,
                              const track_map::Service* service);

 private:
  friend Base;

  void render_state(State& state);
  void refresh_outline(State& state);
  void refresh_cars(State& state);
  [[nodiscard]] bool build(State& state, const Layout& layout, const Config& configuration,
                           const frame::ValueBinding& binding, const fonts::Registry& fonts,
                           const track_map::Service* service);

  track_map::Outline outline_{};
  std::array<track_map::Car, track_map::kMaximumCars> cars_{};
  std::array<Dot, track_map::kMaximumCars> placed_{};
};

}
