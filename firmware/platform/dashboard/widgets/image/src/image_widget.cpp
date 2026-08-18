#include "image_widget.hpp"

#include "esp_lvgl_port.h"
#include "image_asset_types.hpp"
#include "logger.hpp"
#include "lvgl.h"

namespace simcore::dashboard::image_widget {
namespace {

constexpr char kTag[] = "image_widget";


// Where a rule's value colour lands for this widget type. A bitmap cannot take
// a colour outright, so it takes a tint.
void apply_recolor(void* const context, const std::uint32_t rgb) {
  lv_obj_set_style_image_recolor(static_cast<lv_obj_t*>(context),
                                 lv_color_hex(rgb), LV_PART_MAIN);
}

}  // namespace

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
  if (layout.display == nullptr || reads.size() != configurations.size() ||
      read_contexts.size() != configurations.size()) {
    return false;
  }
  return build_all(configurations.size(),
                   [&](State& state, const std::size_t index) {
                     return build(state, layout, configurations[index],
                                  reads[index], read_contexts[index], fonts,
                                  images);
                   });
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const frame::ValueReadCallback read,
                          void* const read_context,
                          const fonts::Registry& fonts,
                          const images::Registry& images) {
  return rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, read, read_context, fonts,
                 images);
  });
}

}  // namespace simcore::dashboard::image_widget
