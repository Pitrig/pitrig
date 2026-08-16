#include "image_widget.hpp"

#include "esp_lvgl_port.h"
#include "image_asset_types.hpp"
#include "logger.hpp"
#include "lvgl.h"

namespace simcore::dashboard::image_widget {
namespace {

constexpr char kTag[] = "image_widget";

// An image has nothing to poll: it re-renders only so a blink phase can advance
// and a held rule can run out, both of which follow the display cadence.
constexpr std::uint32_t kRenderPeriodMs = LV_DEF_REFR_PERIOD;

// Where a rule's value colour lands for this widget type. A bitmap cannot take
// a colour outright, so it takes a tint.
void apply_recolor(void* const context, const std::uint32_t rgb) {
  lv_obj_set_style_image_recolor(static_cast<lv_obj_t*>(context),
                                 lv_color_hex(rgb), LV_PART_MAIN);
}

}  // namespace

Collection::~Collection() { destroy(); }

void Collection::destroy() {
  if (!created_ || !lvgl_port_lock(0)) {
    return;
  }
  clear_objects();
  lvgl_port_unlock();
}

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const frame::ValueReadCallback read,
                       void* const read_context, const fonts::Registry& fonts,
                       const images::Registry& images) {
  const lv_image_dsc_t* const descriptor = images.resolve(config.image);
  if (descriptor == nullptr) {
    // Composition checks this before anything is torn down, so reaching here
    // means the package changed underneath a running dashboard.
    log::error(kTag, "Image '%s' is not installed",
               image_assets::image_id_view(config.image).data());
    return false;
  }
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  // The image is drawn at the size it was uploaded at, so the placement decides
  // the box outright.
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.image = lv_image_create(box.container);
  lv_obj_remove_style_all(state.image);
  lv_obj_center(state.image);
  lv_obj_remove_flag(state.image, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(state.image, LV_OBJ_FLAG_CLICKABLE);
  lv_image_set_src(state.image, descriptor);
  const bool recolored = config.recolor != configuration::kTransparentColor;
  if (recolored) {
    lv_obj_set_style_image_recolor(state.image, lv_color_hex(config.recolor),
                                   LV_PART_MAIN);
  }
  lv_obj_set_style_image_recolor_opa(
      state.image, recolored ? config.recolor_opa : 0, LV_PART_MAIN);

  state.painter.configure(config.frame, box,
                          recolored ? config.recolor : config.frame.border.color,
                          &apply_recolor, state.image);
  state.painter.bind(read, read_context);
  return true;
}

bool Collection::create(const Layout& layout,
                        const std::span<const Config> configurations,
                        const std::span<const frame::ValueReadCallback> reads,
                        const std::span<void* const> read_contexts,
                        const fonts::Registry& fonts,
                        const images::Registry& images) {
  if (layout.display == nullptr || configurations.size() > states_.size() ||
      reads.size() != configurations.size() ||
      read_contexts.size() != configurations.size() || created_ ||
      !lvgl_port_lock(0)) {
    return false;
  }

  created_ = true;
  for (std::size_t widget = 0; widget < configurations.size(); ++widget) {
    if (!build(states_[count_], layout, configurations[widget], reads[widget],
               read_contexts[widget], fonts, images)) {
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
                          const fonts::Registry& fonts,
                          const images::Registry& images) {
  if (!created_ || index >= count_ || !lvgl_port_lock(0)) {
    return false;
  }
  State& state = states_[index];
  release(state);
  const bool built =
      build(state, layout, configuration, read, read_context, fonts, images);
  if (built) {
    state.painter.render();
  } else {
    release(state);
  }
  lvgl_port_unlock();
  return built;
}

}  // namespace simcore::dashboard::image_widget
