#include "shape_widget.hpp"

#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard::shape_widget {
namespace {

constexpr char kTag[] = "shape_widget";

}  // namespace

bool Collection::build(State& state, const Layout& layout,
                       const Config& config,
                       const frame::ValueReadCallback read,
                       void* const read_context, const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  // A shape asks for no content of its own, so the placement decides its size
  // outright.
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;
  if (config.kind == configuration::ShapeKind::ellipse) {
    // A radius of half the shorter side is a circle on a square placement and
    // an oval on any other, which is what an ellipse means here.
    lv_obj_set_style_radius(box.container, LV_RADIUS_CIRCLE, LV_PART_MAIN);
    if (box.background_fill != nullptr) {
      lv_obj_set_style_radius(box.background_fill, LV_RADIUS_CIRCLE,
                              LV_PART_MAIN);
    }
  }
  // The frame is the whole widget, so it also carries the value colour a rule
  // may set: there is no separate content to paint.
  state.painter.configure(config.frame, box, config.frame.border.color,
                          nullptr, nullptr);
  state.painter.bind(read, read_context);
  return true;
}


bool Collection::create(const Layout& layout,
                        const std::span<const Config> configurations,
                        const std::span<const frame::ValueReadCallback> reads,
                        const std::span<void* const> read_contexts,
                        const fonts::Registry& fonts,
                        const std::span<lv_obj_t*> containers) {
  if (layout.display == nullptr || reads.size() != configurations.size() ||
      read_contexts.size() != configurations.size()) {
    return false;
  }
  containers_ = containers;
  // Built in pool order, which the parser made parent-before-child, so a
  // container's object exists by the time anything inside it resolves a parent.
  return build_all(configurations.size(),
                   [&](State& state, const std::size_t index) {
                     if (!build(state, layout, configurations[index],
                                reads[index], read_contexts[index], fonts)) {
                       return false;
                     }
                     if (index < containers_.size()) {
                       containers_[index] = state.container;
                     }
                     return true;
                   });
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const frame::ValueReadCallback read,
                          void* const read_context,
                          const fonts::Registry& fonts,
                          const std::span<lv_obj_t*> containers) {
  containers_ = containers;
  const bool built = rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, read, read_context, fonts);
  });
  if (index < containers_.size()) {
    containers_[index] = built ? root_object(index) : nullptr;
  }
  return built;
}

}  // namespace simcore::dashboard::shape_widget
