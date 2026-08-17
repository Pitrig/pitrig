#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_layout.hpp"
#include "widget_frame.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;

namespace simcore::dashboard::shape_widget {

inline constexpr std::size_t kMaximumInstances =
    configuration::kMaximumShapeWidgets;

using Config = configuration::ShapeWidgetConfiguration;

// Panels, dividers, backing plates — and the containers other widgets are
// authored inside. A shape is its frame and nothing else, so this collection
// owns no content of its own: it builds the box, hands it to the frame painter,
// and lets styling rules hide or flash it. `containers` is how the box it built
// reaches the children parented to it, written per pool index so a child can
// resolve its parent by the index its frame carries.
class Collection final {
 public:
  Collection() = default;
  ~Collection();
  Collection(const Collection&) = delete;
  Collection& operator=(const Collection&) = delete;

  [[nodiscard]] bool create(const Layout& layout,
                            std::span<const Config> configurations,
                            std::span<const frame::ValueReadCallback> reads,
                            std::span<void* const> read_contexts,
                            const fonts::Registry& fonts,
                            std::span<lv_obj_t*> containers);
  [[nodiscard]] lv_obj_t* root_object(std::size_t index) const {
    return index < count_ ? states_[index].container : nullptr;
  }
  void destroy();
  void wake();
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout,
                              const Config& configuration,
                              frame::ValueReadCallback read, void* read_context,
                              const fonts::Registry& fonts,
                              std::span<lv_obj_t*> containers);

 private:
  struct State {
    frame::Painter painter{};
    lv_obj_t* container{};
  };

  static void update(lv_timer_t* timer);
  void render();
  void clear_objects();
  void release(State& state);
  [[nodiscard]] bool build(State& state, const Layout& layout,
                           const Config& configuration,
                           frame::ValueReadCallback read, void* read_context,
                           const fonts::Registry& fonts);

  // Published so a child can find its parent, and cleared alongside the object
  // it names so a released container never leaves a stale pointer behind.
  std::span<lv_obj_t*> containers_{};

  std::array<State, kMaximumInstances> states_{};
  std::size_t count_{};
  lv_timer_t* timer_{};
  bool created_{};
};

}  // namespace simcore::dashboard::shape_widget
