#pragma once

#include <array>
#include <cstddef>
#include <span>

#include "application_configuration.hpp"
#include "dashboard_fonts.hpp"
#include "dashboard_images.hpp"
#include "dashboard_layout.hpp"
#include "widget_collection.hpp"
#include "widget_frame.hpp"

struct _lv_obj_t;
using lv_obj_t = _lv_obj_t;
struct _lv_timer_t;
using lv_timer_t = _lv_timer_t;

namespace simcore::dashboard::image_widget {

inline constexpr std::size_t kMaximumInstances =
    configuration::kMaximumImageWidgets;

using Config = configuration::ImageWidgetConfiguration;

// An uploaded image inside a frame. The descriptor comes from the image
// registry and is never copied again, so drawing costs one LVGL object and no
// allocation; a rule's colour lands on the recolour, which is the only thing a
// bitmap can be tinted by.
struct State {
  frame::Painter painter{};
  lv_obj_t* container{};
  lv_obj_t* image{};
};

class Collection final
    : public frame::Collection<Collection, State, kMaximumInstances> {
 public:
  [[nodiscard]] bool create(const Layout& layout,
                            std::span<const Config> configurations,
                            std::span<const frame::ValueReadCallback> reads,
                            std::span<void* const> read_contexts,
                            const fonts::Registry& fonts,
                            const images::Registry& images);
  [[nodiscard]] bool recreate(std::size_t index, const Layout& layout,
                              const Config& configuration,
                              frame::ValueReadCallback read, void* read_context,
                              const fonts::Registry& fonts,
                              const images::Registry& images);

 private:
  friend frame::Collection<Collection, State, kMaximumInstances>;

  [[nodiscard]] bool build(State& state, const Layout& layout,
                           const Config& configuration,
                           frame::ValueReadCallback read, void* read_context,
                           const fonts::Registry& fonts,
                           const images::Registry& images);
};

}  // namespace simcore::dashboard::image_widget
