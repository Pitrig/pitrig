#include "slot_widget.hpp"

#include "esp_lvgl_port.h"
#include "lvgl.h"

namespace simcore::dashboard::slot_widget {
namespace {

constexpr char kTag[] = "slot_widget";

}  // namespace

Collection::~Collection() { destroy(); }

void Collection::destroy() {
  if (!created_ || !lvgl_port_lock(0)) {
    return;
  }
  clear_objects();
  lvgl_port_unlock();
}

bool Collection::build(State& state, const std::size_t index,
                       const Layout& layout, const Config& config,
                       const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  // A slot asks for no content of its own, so the placement decides its size
  // outright. Going through the frame rather than around it is what gives the
  // slot the same placement, parent resolution and bounds check every other
  // widget gets; nothing is painted because the validator already refused every
  // property that would paint something.
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;

  // Taken from the resolved bounds rather than read back off the object: LVGL
  // owns when a just-set size reaches `coords`, and a page that measured itself
  // as zero would put every widget on it outside the display, which the bounds
  // check then refuses. The padding comes back out because LVGL places a child
  // against the content area, and a slot has no border for validation refuses
  // one.
  const std::int32_t page_width =
      bounds.width - config.frame.padding.left - config.frame.padding.right;
  const std::int32_t page_height =
      bounds.height - config.frame.padding.top - config.frame.padding.bottom;
  if (page_width <= 0 || page_height <= 0) {
    return false;
  }
  const std::size_t base = index * configuration::kMaximumSlotPages;
  for (std::uint8_t page = 0; page < config.page_count; ++page) {
    lv_obj_t* const object = lv_obj_create(box.container);
    if (object == nullptr) {
      return false;
    }
    lv_obj_remove_style_all(object);
    lv_obj_set_pos(object, 0, 0);
    lv_obj_set_size(object, page_width, page_height);
    // Built refusing input like every other object: the controller is what makes
    // the slot itself clickable, so a page never swallows the tap that cycles it.
    lv_obj_remove_flag(object, LV_OBJ_FLAG_CLICKABLE);
    // A page holds absolutely placed widgets, so it may not scroll — the same
    // reason a screen and every widget frame drop the flag. Left on, a widget
    // reaching past the page would become scrollable content rather than an
    // overhang.
    lv_obj_remove_flag(object, LV_OBJ_FLAG_SCROLLABLE);
    // Whether a page clips its widgets is the slot's `clip_children`, and the
    // composition is what applies it — here and on a container shape through
    // the same pass, so a page and a shape cannot drift apart. A fresh object
    // clips, which is also the default, so nothing is set here.
    if (base + page < pages_.size()) {
      pages_[base + page] = object;
    }
    ++state.page_count;
  }
  return true;
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

void Collection::clear_objects() {
  // Deleting the slot deletes its pages with it, so the page table is cleared
  // first: a pointer published there would otherwise outlive its object.
  for (std::size_t index = count_; index > 0; --index) {
    State& state = states_[index - 1];
    const std::size_t base = (index - 1) * configuration::kMaximumSlotPages;
    for (std::uint8_t page = 0; page < state.page_count; ++page) {
      if (base + page < pages_.size()) {
        pages_[base + page] = nullptr;
      }
    }
    if (state.container != nullptr) {
      lv_obj_delete(state.container);
    }
    state = {};
  }
  count_ = 0;
  created_ = false;
}

}  // namespace simcore::dashboard::slot_widget
