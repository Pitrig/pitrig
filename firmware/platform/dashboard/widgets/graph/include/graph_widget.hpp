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

namespace simcore::dashboard::graph_widget {

inline constexpr std::size_t kMaximumInstances =
    configuration::kMaximumGraphWidgets;
inline constexpr std::size_t kMaximumPoints = configuration::kMaximumGraphPoints;
inline constexpr std::size_t kMaximumSources =
    configuration::kMaximumGraphSources;

static_assert(kMaximumSources == configuration::kMaximumGraphTraces + 1);

using Config = configuration::GraphWidgetConfiguration;

struct WidgetBinding;

struct Trace {
  frame::ValueReadCallback read{};
  void* read_context{};
  configuration::ValueRange range{};
  std::uint32_t color{};
  std::int32_t previous_y{};
  bool has_previous{};
};

struct State {
  frame::Painter painter{};
  lv_obj_t* container{};
  lv_obj_t* canvas{};
  std::array<Trace, kMaximumSources> traces{};
  std::size_t trace_count{};
  std::uint16_t sample_interval_ms{};
  std::uint16_t line_width_px{};
  std::uint32_t last_sample_tick{};
  std::uint32_t override_rgb{};
  std::uint32_t background_rgb{};
  std::int32_t plot_width{};
  std::int32_t plot_height{};
  std::int32_t line_inset{};
  std::int32_t head_x{};
  float step_px{};
  float step_carry{};
  bool initialized{};
};

class Collection final
    : public frame::Collection<Collection, State, kMaximumInstances> {
 public:
  [[nodiscard]] bool create(const Layout& layout,
                            std::span<const Config> configurations,
                            std::span<const WidgetBinding> bindings,
                            const fonts::Registry& fonts);
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout,
                              const Config& configuration,
                              const WidgetBinding& binding,
                              const fonts::Registry& fonts);

 private:
  friend frame::Collection<Collection, State, kMaximumInstances>;

  void render_state(State& state);
  [[nodiscard]] bool build(State& state, const Layout& layout,
                           const Config& configuration,
                           const WidgetBinding& binding,
                           const fonts::Registry& fonts);
};

}
