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

struct State {
  frame::Painter painter{};
  lv_obj_t* container{};
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
  [[nodiscard]] bool restyle(std::size_t index, const Layout& layout,
                             const Config& configuration,
                             frame::ValueReadCallback read, void* read_context,
                             const fonts::Registry& fonts);
  [[nodiscard]] bool holds_widgets(std::size_t index) const;
  void on_released(std::size_t index) {
    if (index < containers_.size()) {
      containers_[index] = nullptr;
    }
  }

  std::span<lv_obj_t*> containers_{};
};

}
