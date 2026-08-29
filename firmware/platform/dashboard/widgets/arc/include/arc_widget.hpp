#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "lvgl.h"
#include "widget_collection.hpp"
#include "widget_frame.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;

namespace simcore::dashboard::arc_widget {

inline constexpr std::size_t kMaximumInstances =
    configuration::kMaximumArcWidgets;

using Config = configuration::ArcWidgetConfiguration;

struct State {
  frame::Painter painter{};
  frame::ValueReadCallback read{};
  void* read_context{};
  configuration::ValueRange range{};
  bool inverted{};
  bool free_running{};
  lv_obj_t* container{};
  lv_obj_t* arc{};
  lv_obj_t* needle{};
  std::array<lv_point_precise_t, 2> needle_points{};
  float centre_x{};
  float centre_y{};
  float needle_radius{};
  float start_angle_deg{};
  float sweep_deg{};
  std::uint64_t rendered_revision{};
  bool rendered_available{};
  std::int32_t drawn_per_mille{-1};
  bool initialized{};
};

class Collection final
    : public frame::Collection<Collection, State, kMaximumInstances> {
 public:
  [[nodiscard]] bool create(const Layout& layout,
                            std::span<const Config> configurations,
                            std::span<const frame::ValueBinding> bindings,
                            const fonts::Registry& fonts);
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout,
                              const Config& configuration,
                              const frame::ValueBinding& binding,
                              const fonts::Registry& fonts);

 private:
  friend frame::Collection<Collection, State, kMaximumInstances>;

  void render_state(State& state);
  [[nodiscard]] bool build(State& state, const Layout& layout,
                           const Config& configuration,
                           const frame::ValueBinding& binding,
                           const fonts::Registry& fonts);
};

}
