#include "shape_widget.hpp"

#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard::shape_widget {
namespace {

constexpr char kTag[] = "shape_widget";

// A shape has nothing to poll: it re-renders only so a blink phase can advance
// and a held rule can run out, both of which follow the display cadence.
constexpr std::uint32_t kRenderPeriodMs = LV_DEF_REFR_PERIOD;

}  // namespace

Collection::~Collection() { destroy(); }

void Collection::destroy() {
  if (!created_ || !lvgl_port_lock(0)) {
    return;
  }
  clear_objects();
  lvgl_port_unlock();
}

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
                        const fonts::Registry& fonts) {
  if (layout.display == nullptr || configurations.size() > states_.size() ||
      reads.size() != configurations.size() ||
      read_contexts.size() != configurations.size() || created_ ||
      !lvgl_port_lock(0)) {
    return false;
  }

  created_ = true;
  for (std::size_t widget = 0; widget < configurations.size(); ++widget) {
    if (!build(states_[count_], layout, configurations[widget], reads[widget],
               read_contexts[widget], fonts)) {
      clear_objects();
      created_ = false;
      lvgl_port_unlock();
      return false;
    }
    ++count_;
  }

  render();
  if (count_ > 0) {
    timer_ = lv_timer_create(update, kRenderPeriodMs, this);
    if (timer_ == nullptr) {
      clear_objects();
      created_ = false;
      lvgl_port_unlock();
      return false;
    }
  }

  lvgl_port_unlock();
  return true;
}

void Collection::update(lv_timer_t* const timer) {
  auto* const collection =
      static_cast<Collection*>(lv_timer_get_user_data(timer));
  if (collection != nullptr) {
    collection->render();
  }
}

void Collection::wake() {
  if (timer_ != nullptr) {
    lv_timer_ready(timer_);
  }
}

void Collection::render() {
  if (!created_) {
    return;
  }
  for (std::size_t index = 0; index < count_; ++index) {
    states_[index].painter.render();
  }
}

void Collection::release(State& state) {
  state.painter.release();
  if (state.container != nullptr) {
    lv_obj_delete(state.container);
  }
  state = {};
}

void Collection::clear_objects() {
  if (timer_ != nullptr) {
    lv_timer_delete(timer_);
    timer_ = nullptr;
  }
  for (std::size_t index = 0; index < count_; ++index) {
    release(states_[index]);
  }
  count_ = 0;
  created_ = false;
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const frame::ValueReadCallback read,
                          void* const read_context,
                          const fonts::Registry& fonts) {
  if (!created_ || index >= count_ || !lvgl_port_lock(0)) {
    return false;
  }
  State& state = states_[index];
  release(state);
  const bool built =
      build(state, layout, configuration, read, read_context, fonts);
  if (built) {
    state.painter.render();
  } else {
    release(state);
  }
  lvgl_port_unlock();
  return built;
}

}  // namespace simcore::dashboard::shape_widget
