#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "lvgl.h"
#include "lvgl_types.hpp"
#include "widget_collection.hpp"
#include "widget_frame.hpp"

namespace pitrig::dashboard::arc_widget {

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
  lv_draw_buf_t* gradient{};
  std::uint32_t fill_rgb{};
  std::array<lv_point_precise_t, 2> needle_points{};
  float centre_x{};
  float centre_y{};
  float needle_radius{};
  float sector_start_deg{};
  float sector_deg{};
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
