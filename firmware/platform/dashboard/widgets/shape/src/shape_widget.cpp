#include "shape_widget.hpp"

#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace pitrig::dashboard::shape_widget {
namespace {

constexpr char kTag[] = "shape_widget";

void apply_kind(const Config& config, const frame::Box& box) {
  if (config.kind != configuration::ShapeKind::ellipse) {
    return;
  }
  lv_obj_set_style_radius(box.container, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  if (box.background_fill != nullptr) {
    lv_obj_set_style_radius(box.background_fill, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  }
}

}

bool Collection::build(State& state, const Layout& layout,
                       const Config& config,
                       const frame::ValueBinding& binding,
                       const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.background_fill = box.background_fill;
  apply_kind(config, box);
  state.painter.configure(config.frame, box, config.frame.border.color,
                          nullptr, nullptr);
  state.painter.bind(binding.condition_read, binding.condition_context);
  state.painter.bind_caption(binding.caption_read, binding.caption_context);
  return true;
}

bool Collection::restyle(const std::size_t index, const Layout& layout,
                         const Config& config,
                         const frame::ValueBinding& binding,
                         const fonts::Registry& fonts) {
  return update_one(index, [&](State& state) {
    frame::Box box{.container = state.container,
                   .background_fill = state.background_fill};
    if (!frame::update(layout, config.frame, kTag, 0, 0, false, fonts, box)) {
      return false;
    }
    apply_kind(config, box);
    state.painter.release();
    state.painter.configure(config.frame, box, config.frame.border.color,
                            nullptr, nullptr);
    state.painter.bind(binding.condition_read, binding.condition_context);
    state.painter.bind_caption(binding.caption_read, binding.caption_context);
    return true;
  });
}

bool Collection::holds_widgets(const std::size_t index) const {
  const lv_obj_t* const container = root_object(index);
  if (container == nullptr) {
    return false;
  }
  if (!frame::lock_lvgl()) {
    return true;
  }
  const std::uint32_t children = lv_obj_get_child_count(container);
  frame::unlock_lvgl();
  return children > (states_[index].background_fill != nullptr ? 1U : 0U);
}

bool Collection::create(const Layout& layout,
                        const std::span<const Config> configurations,
                        const std::span<const frame::ValueBinding> bindings,
                        const fonts::Registry& fonts,
                        const std::span<lv_obj_t*> containers) {
  if (layout.display == nullptr || bindings.size() != configurations.size()) {
    return false;
  }
  containers_ = containers;
  return build_all(configurations.size(),
                   [&](State& state, const std::size_t index) {
                     if (!build(state, layout, configurations[index],
                                bindings[index], fonts)) {
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
                          const frame::ValueBinding& binding,
                          const fonts::Registry& fonts,
                          const std::span<lv_obj_t*> containers) {
  containers_ = containers;
  if (restyle(index, layout, configuration, binding, fonts)) {
    return true;
  }
  if (holds_widgets(index)) {
    return false;
  }
  const bool built = rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, binding, fonts);
  });
  if (index < containers_.size()) {
    containers_[index] = built ? root_object(index) : nullptr;
  }
  return built;
}

}
