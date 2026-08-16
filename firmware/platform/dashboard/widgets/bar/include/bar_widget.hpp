#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "widget_frame.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;

namespace simcore::dashboard::bar_widget {

inline constexpr std::size_t kMaximumInstances =
    configuration::kMaximumBarWidgets;

using Config = configuration::BarWidgetConfiguration;

// One telemetry source drawn as a filled proportion of the widget. The fill is
// a child rectangle resized per render rather than an lv_bar, so invalidation
// stays this widget's own business, the way the Delta Time scale already works.
class Collection final {
 public:
  Collection() = default;
  ~Collection();
  Collection(const Collection&) = delete;
  Collection& operator=(const Collection&) = delete;

  [[nodiscard]] bool create(const Layout& layout,
                            std::span<const Config> configurations,
                            std::span<const frame::ValueBinding> bindings,
                            const fonts::Registry& fonts);
  [[nodiscard]] lv_obj_t* root_object(std::size_t index) const {
    return index < count_ ? states_[index].container : nullptr;
  }
  void destroy();
  void wake();
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout,
                              const Config& configuration,
                              const frame::ValueBinding& binding,
                              const fonts::Registry& fonts);

 private:
  struct State {
    frame::Painter painter{};
    frame::ValueReadCallback read{};
    void* read_context{};
    configuration::ValueRange range{};
    configuration::BarOrientation orientation{};
    bool inverted{};
    bool free_running{};
    lv_obj_t* container{};
    lv_obj_t* fill{};
    // Content box the fill runs inside, in the container's child coordinates.
    std::int32_t inner_width{};
    std::int32_t inner_height{};
    std::int32_t origin_x{};
    std::int32_t origin_y{};
    std::uint64_t rendered_revision{};
    bool rendered_available{};
    // Fill length already on screen, so an unchanged proportion touches no LVGL.
    std::int32_t drawn_length{-1};
    bool initialized{};
  };

  static void update(lv_timer_t* timer);
  void render();
  void render_state(State& state);
  void clear_objects();
  void release(State& state);
  [[nodiscard]] bool build(State& state, const Layout& layout,
                           const Config& configuration,
                           const frame::ValueBinding& binding,
                           const fonts::Registry& fonts);

  std::array<State, kMaximumInstances> states_{};
  std::size_t count_{};
  lv_timer_t* timer_{};
  bool created_{};
};

}  // namespace simcore::dashboard::bar_widget
