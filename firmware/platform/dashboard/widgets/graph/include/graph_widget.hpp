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

using Config = configuration::GraphWidgetConfiguration;

// A rolling trace of one source, drawn with lv_line over a point array this
// widget owns. lv_chart is not used: it allocates on every draw pass, which the
// periodic render path does not allow.
struct State {
  frame::Painter painter{};
  frame::ValueReadCallback read{};
  void* read_context{};
  configuration::ValueRange range{};
  bool free_running{};
  lv_obj_t* container{};
  lv_obj_t* line{};
  // The trace is presentation geometry: a bounded history the widget samples
  // for itself, never published and discarded with the widget.
  std::array<float, kMaximumPoints> samples{};
  std::array<lv_point_precise_t, kMaximumPoints> points{};
  std::size_t point_count{};
  std::size_t filled{};
  std::uint16_t sample_interval_ms{};
  std::uint32_t last_sample_tick{};
  std::int32_t plot_width{};
  std::int32_t plot_height{};
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

}  // namespace simcore::dashboard::graph_widget
