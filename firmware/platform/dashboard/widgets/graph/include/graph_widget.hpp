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

// The widget's own source is the first trace and the array holds the rest, so
// the two caps have to agree or a document the contract accepts would not fit.
static_assert(kMaximumSources == configuration::kMaximumGraphTraces + 1);

using Config = configuration::GraphWidgetConfiguration;

struct WidgetBinding;

// One source drawn on the plot: how it is read, the window it is read through,
// the colour it is authored in, and the LVGL line it owns.
struct Trace {
  frame::ValueReadCallback read{};
  void* read_context{};
  configuration::ValueRange range{};
  // The authored colour, kept so a styling rule that has stopped matching gives
  // each trace its own back rather than flattening them all to one.
  std::uint32_t color{};
  lv_obj_t* line{};
  // The trace is presentation geometry: a bounded history the widget samples
  // for itself, never published and discarded with the widget. Every x is
  // written once when the plot is built, so taking a sample moves only the y
  // values.
  std::array<lv_point_precise_t, kMaximumPoints> points{};
};

// Owns the fixed runtime state of one graph. lv_chart is not used: it allocates
// on every draw pass, which the periodic render path does not allow.
struct State {
  frame::Painter painter{};
  lv_obj_t* container{};
  std::array<Trace, kMaximumSources> traces{};
  std::size_t trace_count{};
  // One history depth and one clock for the whole widget: the plot has a single
  // time axis, so traces sampled apart would not line up along it.
  std::size_t point_count{};
  std::size_t filled{};
  std::uint16_t sample_interval_ms{};
  std::uint32_t last_sample_tick{};
  std::int32_t plot_height{};
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

}  // namespace simcore::dashboard::graph_widget
