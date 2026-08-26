#include "slot_widget.hpp"

#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard::slot_widget {
namespace {

constexpr char kTag[] = "slot_widget";

}

Collection::~Collection() { destroy(); }

void Collection::destroy() {
  if (!created_ || !lvgl_port_lock(0)) {
    return;
  }
  clear_objects();
  lvgl_port_unlock();
}

bool Collection::place_pages(State& state, const std::size_t index,
                             const Config& config, const Rect& bounds,
                             const bool create_objects) {
  const std::int32_t page_width =
      bounds.width - config.frame.padding.left - config.frame.padding.right;
  const std::int32_t page_height =
      bounds.height - config.frame.padding.top - config.frame.padding.bottom;
  if (page_width <= 0 || page_height <= 0) {
    return false;
  }
  const std::size_t base = index * configuration::kMaximumSlotPages;
  for (std::uint8_t page = 0; page < config.page_count; ++page) {
    if (base + page >= pages_.size()) {
      return false;
    }
    lv_obj_t* object = pages_[base + page];
    if (create_objects) {
      object = lv_obj_create(state.box.container);
      if (object == nullptr) {
        return false;
      }
      lv_obj_remove_style_all(object);
      lv_obj_remove_flag(object, LV_OBJ_FLAG_CLICKABLE);
      lv_obj_remove_flag(object, LV_OBJ_FLAG_SCROLLABLE);
      pages_[base + page] = object;
      ++state.page_count;
    }
    if (object == nullptr) {
      return false;
    }
    lv_obj_set_pos(object, 0, 0);
    lv_obj_set_size(object, page_width, page_height);
  }
  return true;
}

bool Collection::build(State& state, const std::size_t index,
                       const Layout& layout, const Config& config,
                       const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.box = box;
  return place_pages(state, index, config, bounds, true);
}

bool Collection::update(const std::size_t index, const Layout& layout,
                        const Config& config, const fonts::Registry& fonts,
                        const std::span<lv_obj_t*> pages) {
  if (index >= count_ || !created_ || !lvgl_port_lock(0)) {
    return false;
  }
  pages_ = pages;
  State& state = states_[index];
  bool updated{};
  if (state.box.container == nullptr) {
    updated = build(state, index, layout, config, fonts);
    if (!updated) {
      release(state, index);
    }
    lvgl_port_unlock();
    return updated;
  }
  if (state.page_count != config.page_count) {
    lvgl_port_unlock();
    return false;
  }
  frame::Box box = state.box;
  Rect bounds{};
  if (!frame::update(layout, config.frame, kTag, 0, 0, false, fonts, box,
                     &bounds)) {
    lvgl_port_unlock();
    return false;
  }
  for (lv_obj_t* const object : {state.box.caption, state.box.caption_gap}) {
    if (object != nullptr) {
      lv_obj_delete(object);
    }
  }
  state.box = box;
  updated = place_pages(state, index, config, bounds, false);
  lvgl_port_unlock();
  return updated;
}

bool Collection::create(const Layout& layout,
                        const std::span<const Config> configurations,
                        const fonts::Registry& fonts,
                        const std::span<lv_obj_t*> pages) {
  if (layout.display == nullptr || configurations.size() > states_.size() ||
      created_ || !lvgl_port_lock(0)) {
    return false;
  }

  created_ = true;
  pages_ = pages;
  for (std::size_t widget = 0; widget < configurations.size(); ++widget) {
    if (!build(states_[count_], count_, layout, configurations[widget],
               fonts)) {
      clear_objects();
      created_ = false;
      lvgl_port_unlock();
      return false;
    }
    ++count_;
  }

  lvgl_port_unlock();
  return true;
}

bool Collection::extend_to(const std::size_t count) {
  if (count > states_.size() || count < count_ || !lvgl_port_lock(0)) {
    return false;
  }
  created_ = true;
  count_ = count;
  lvgl_port_unlock();
  return true;
}

bool Collection::shrink_to(const std::size_t count) {
  if (count > count_ || !created_ || !lvgl_port_lock(0)) {
    return false;
  }
  while (count_ > count) {
    --count_;
    release(states_[count_], count_);
  }
  lvgl_port_unlock();
  return true;
}

void Collection::release(State& state, const std::size_t index) {
  const std::size_t base = index * configuration::kMaximumSlotPages;
  for (std::uint8_t page = 0; page < state.page_count; ++page) {
    if (base + page < pages_.size()) {
      pages_[base + page] = nullptr;
    }
  }
  for (lv_obj_t* const object : {state.box.caption, state.box.caption_gap}) {
    if (object != nullptr) {
      lv_obj_delete(object);
    }
  }
  if (state.box.container != nullptr) {
    lv_obj_delete(state.box.container);
  }
  state = {};
}

void Collection::clear_objects() {
  for (std::size_t index = count_; index > 0; --index) {
    release(states_[index - 1], index - 1);
  }
  count_ = 0;
  created_ = false;
}

}
