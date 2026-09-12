#pragma once

#include <cstddef>
#include <cstdint>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "lvgl.h"
#include "lvgl_types.hpp"
#include "value_widget_collection.hpp"
#include "widget_collection.hpp"
#include "widget_frame.hpp"

namespace pitrig::dashboard::arc_widget {

inline constexpr std::size_t kMaximumInstances = configuration::kMaximumArcWidgets;

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
  lv_draw_buf_t* gradient{};
  std::uint32_t fill_rgb{};
  std::uint32_t needle_rgb{};
  std::int32_t needle_width{};
  bool needle{};
  float centre_x{};
  float centre_y{};
  float needle_radius{};
  float sector_start_deg{};
  float sector_deg{};
  float tip_x{};
  float tip_y{};
  std::uint64_t rendered_revision{};
  bool rendered_available{};
  std::int32_t drawn_per_mille{-1};
  bool initialized{};
};

class Collection final
    : public ValueWidgetCollection<Collection, State, kMaximumInstances, Config> {
 private:
  friend frame::Collection<Collection, State, kMaximumInstances>;
  friend ValueWidgetCollection<Collection, State, kMaximumInstances, Config>;

  void render_state(State& state);
  [[nodiscard]] bool build(State& state, const Layout& layout, const Config& configuration,
                           const frame::ValueBinding& binding, const fonts::Registry& fonts);
};

}
