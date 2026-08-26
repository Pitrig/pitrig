#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "widget_collection.hpp"
#include "widget_frame.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;

namespace simcore::dashboard::indicator_widget {

inline constexpr std::size_t kMaximumInstances =
    configuration::kMaximumIndicatorWidgets;
inline constexpr std::size_t kMaximumSegments =
    configuration::kMaximumIndicatorSegments;

using Config = configuration::IndicatorWidgetConfiguration;

struct State {
  frame::Painter painter{};
  frame::ValueReadCallback read{};
  void* read_context{};
  configuration::ValueRange range{};
  std::array<lv_obj_t*, kMaximumSegments> segments{};
  std::array<float, kMaximumSegments> thresholds{};
  std::array<std::uint32_t, kMaximumSegments> colors{};
  std::size_t segment_count{};
  std::uint32_t off_color{};
  bool has_off_color{};
  float blink_threshold{};
  std::uint16_t blink_ms{};
  bool free_running{};
  lv_obj_t* container{};
  std::uint64_t rendered_revision{};
  bool rendered_available{};
  std::uint32_t drawn_mask{};
  bool drawn_blink_visible{true};
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
