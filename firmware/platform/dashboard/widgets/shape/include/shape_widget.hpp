#pragma once

#include <array>
#include <cstddef>
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
struct State {
  frame::Painter painter{};
  lv_obj_t* container{};
  // Kept because an in-place update restyles the objects it already has, and an
  // inset background is a second one. The caption is not here: it belongs to the
  // painter, which is what deletes it.
  lv_obj_t* background_fill{};
};

class Collection final
    : public frame::Collection<Collection, State, kMaximumInstances> {
 public:
  [[nodiscard]] bool create(const Layout& layout,
                            std::span<const Config> configurations,
                            std::span<const frame::ValueReadCallback> reads,
                            std::span<void* const> read_contexts,
                            const fonts::Registry& fonts,
                            std::span<lv_obj_t*> containers);
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout,
                              const Config& configuration,
                              frame::ValueReadCallback read, void* read_context,
                              const fonts::Registry& fonts,
                              std::span<lv_obj_t*> containers);

 private:
  friend frame::Collection<Collection, State, kMaximumInstances>;

  [[nodiscard]] bool build(State& state, const Layout& layout,
                           const Config& configuration,
                           frame::ValueReadCallback read, void* read_context,
                           const fonts::Registry& fonts);
  // A shape that holds widgets is their LVGL parent, so it is restyled rather
  // than rebuilt: deleting the object would delete the children with it. Refuses
  // the same way the frame does, leaving the widget as it stands.
  [[nodiscard]] bool restyle(std::size_t index, const Layout& layout,
                             const Config& configuration,
                             frame::ValueReadCallback read, void* read_context,
                             const fonts::Registry& fonts);
  // Whether anything is parented to this shape's object, which is what decides
  // whether it may be rebuilt. Asked of LVGL rather than of the document: a
  // replacement that moved the last widget out still has it standing inside
  // until its own rebuild moves it, and the document already says the shape is
  // empty.
  [[nodiscard]] bool holds_widgets(std::size_t index) const;
  // A released container must not leave a stale pointer behind for a child to
  // find, so the published table is retracted as the pool is torn down.
  void on_released(std::size_t index) {
    if (index < containers_.size()) {
      containers_[index] = nullptr;
    }
  }

  // Published so a child can find its parent.
  std::span<lv_obj_t*> containers_{};
};

}  // namespace simcore::dashboard::shape_widget
