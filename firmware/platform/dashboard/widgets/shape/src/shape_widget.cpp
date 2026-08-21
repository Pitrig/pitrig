#include "shape_widget.hpp"

#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard::shape_widget {
namespace {

constexpr char kTag[] = "shape_widget";

// The one thing a shape adds to its frame. A radius of half the shorter side is
// a circle on a square placement and an oval on any other, which is what an
// ellipse means here; a rectangle keeps the corner the frame gave it.
void apply_kind(const Config& config, const frame::Box& box) {
  if (config.kind != configuration::ShapeKind::ellipse) {
    return;
  }
  lv_obj_set_style_radius(box.container, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  if (box.background_fill != nullptr) {
    lv_obj_set_style_radius(box.background_fill, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  }
}

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
  state.background_fill = box.background_fill;
  apply_kind(config, box);
  // The frame is the whole widget, so it also carries the value colour a rule
  // may set: there is no separate content to paint.
  state.painter.configure(config.frame, box, config.frame.border.color,
                          nullptr, nullptr);
  state.painter.bind(read, read_context);
  return true;
}

bool Collection::restyle(const std::size_t index, const Layout& layout,
                         const Config& config,
                         const frame::ValueReadCallback read,
                         void* const read_context,
                         const fonts::Registry& fonts) {
  return update_one(index, [&](State& state) {
    // The objects the frame already stands on. What it puts on the parent —
    // the caption and its mask — is left out: the update builds new ones, and
    // the painter still holds the old ones to delete.
    frame::Box box{.container = state.container,
                   .background_fill = state.background_fill};
    if (!frame::update(layout, config.frame, kTag, 0, 0, false, fonts, box)) {
      return false;
    }
    apply_kind(config, box);
    // Released only now that the update has committed, because this is what
    // deletes the caption the widget was drawing with. Configuring afterwards
    // is what adopts the new one.
    state.painter.release();
    state.painter.configure(config.frame, box, config.frame.border.color,
                            nullptr, nullptr);
    state.painter.bind(read, read_context);
    return true;
  });
}

bool Collection::holds_widgets(const std::size_t index) const {
  const lv_obj_t* const container = root_object(index);
  if (container == nullptr) {
    return false;
  }
  if (!frame::lock_lvgl()) {
    // Unable to look, so unable to say it stands alone.
    return true;
  }
  const std::uint32_t children = lv_obj_get_child_count(container);
  frame::unlock_lvgl();
  // The inset background is the frame's own child; the caption and its mask sit
  // on the parent and never count here.
  return children > (states_[index].background_fill != nullptr ? 1U : 0U);
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
  // Restyled first, always. A shape's object may be the parent of widgets other
  // collections own, and deleting it would delete them; the object it keeps is
  // the one the published table already names, so that needs no update either.
  if (restyle(index, layout, configuration, read, read_context, fonts)) {
    return true;
  }
  // The restyle refused a difference it cannot answer for, and wrote nothing.
  // Rebuilding answers for more — a widget that changed parent, an inset
  // background appearing — but only while the object stands alone. Anything
  // else is left to the full recomposition, which is the only path that can put
  // a subtree back together.
  if (holds_widgets(index)) {
    return false;
  }
  const bool built = rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, read, read_context, fonts);
  });
  if (index < containers_.size()) {
    containers_[index] = built ? root_object(index) : nullptr;
  }
  return built;
}

}  // namespace simcore::dashboard::shape_widget
