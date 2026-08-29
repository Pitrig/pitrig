#include "widget_frame.hpp"

#include <algorithm>

#include "dashboard_layout_internal.hpp"
#include "lvgl.h"
#include "telemetry_state.hpp"
#include "widget_frame_internal.hpp"

namespace simcore::dashboard::frame {
namespace {

bool square_fill(const Config& config) {
  return config.fill_corners == configuration::FillCorners::square &&
         config.border.radius_px != 0;
}

void apply_background_gradient(const Config& config, lv_obj_t* const object) {
  if (config.background_grad_color == configuration::kTransparentColor) {
    return;
  }
  lv_obj_set_style_bg_grad_color(
      object, lv_color_hex(config.background_grad_color), LV_PART_MAIN);
  lv_obj_set_style_bg_grad_dir(
      object,
      config.background_grad_dir == configuration::GradientDirection::horizontal
          ? LV_GRAD_DIR_HOR
          : LV_GRAD_DIR_VER,
      LV_PART_MAIN);
}

void style_container(const Config& config, const Rect& bounds,
                     lv_obj_t* const container) {
  const bool has_background =
      config.background_color != configuration::kTransparentColor;
  const bool paints_container = config.background_inset_px == 0;
  lv_obj_set_pos(container, bounds.x, bounds.y);
  lv_obj_set_size(container, bounds.width, bounds.height);
  if (has_background && paints_container) {
    lv_obj_set_style_bg_color(container, lv_color_hex(config.background_color),
                              LV_PART_MAIN);
    apply_background_gradient(config, container);
  }
  lv_obj_set_style_bg_opa(
      container, has_background && paints_container ? LV_OPA_COVER : LV_OPA_TRANSP,
      LV_PART_MAIN);
  lv_obj_set_style_border_color(container, lv_color_hex(config.border.color),
                                LV_PART_MAIN);
  lv_obj_set_style_border_width(container, config.border.width_px, LV_PART_MAIN);
  lv_obj_set_style_border_opa(
      container, config.border.width_px == 0 ? LV_OPA_TRANSP : LV_OPA_COVER,
      LV_PART_MAIN);
  lv_obj_set_style_radius(container, config.border.radius_px, LV_PART_MAIN);
  lv_obj_set_style_clip_corner(container, square_fill(config), LV_PART_MAIN);
  lv_obj_set_style_border_post(container, square_fill(config), LV_PART_MAIN);
  lv_obj_set_style_pad_left(container, config.padding.left, LV_PART_MAIN);
  lv_obj_set_style_pad_top(container, config.padding.top, LV_PART_MAIN);
  lv_obj_set_style_pad_right(container, config.padding.right, LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(container, config.padding.bottom, LV_PART_MAIN);
  lv_obj_remove_flag(container, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(container, LV_OBJ_FLAG_CLICKABLE);
  apply_debug_widget_outline(container);
}

void style_background_fill(const Config& config, const Rect& bounds,
                           lv_obj_t* const fill) {
  const std::int32_t inset = config.background_inset_px;
  const std::int32_t edge = config.border.width_px + inset;
  const bool has_background =
      config.background_color != configuration::kTransparentColor;
  lv_obj_set_pos(fill, inset - static_cast<std::int32_t>(config.padding.left),
                 inset - static_cast<std::int32_t>(config.padding.top));
  lv_obj_set_size(fill, std::max<std::int32_t>(bounds.width - 2 * edge, 0),
                  std::max<std::int32_t>(bounds.height - 2 * edge, 0));
  lv_obj_set_style_radius(fill, fill_radius(config, inset), LV_PART_MAIN);
  if (has_background) {
    lv_obj_set_style_bg_color(fill, lv_color_hex(config.background_color),
                              LV_PART_MAIN);
    apply_background_gradient(config, fill);
  }
  lv_obj_set_style_bg_opa(fill, has_background ? LV_OPA_COVER : LV_OPA_TRANSP,
                          LV_PART_MAIN);
  lv_obj_remove_flag(fill, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(fill, LV_OBJ_FLAG_CLICKABLE);
}

telemetry::TelemetryRead read_telemetry(void* const context) {
  if (context == nullptr) {
    return {};
  }
  const auto& source = *static_cast<const SourceContext*>(context);
  return source.telemetry != nullptr ? source.telemetry->read(source.handle)
                                     : telemetry::TelemetryRead{};
}

}

std::int32_t fill_radius(const Config& config, const std::int32_t inset) {
  if (config.fill_corners == configuration::FillCorners::square) {
    return 0;
  }
  return std::max<std::int32_t>(config.border.radius_px - inset, 0);
}

bool caption_mask_reads_parent(const Config& config) {
  const bool paints_own_fill =
      config.background_color != configuration::kTransparentColor &&
      config.background_inset_px == 0;
  return !paints_own_fill;
}

bool bind_source(const std::string_view name,
                 const std::uint8_t modifier_count,
                 const std::span<const configuration::ValueModifier> modifiers,
                 const telemetry::ITelemetryRegistry& registry,
                 const telemetry::ITelemetryReader& telemetry,
                 const ModifierReaders& modifier_readers,
                 SourceContext& context, ValueReadCallback& read,
                 void*& read_context, bool& fast_updates) {
  const telemetry::Handle handle = registry.resolve(name);
  if (!handle.valid()) {
    return false;
  }
  const bool modified = modifier_count == 1;
  if (modified) {
    const ModifierReader reader =
        modifier_reader(modifier_readers, modifiers.front().type);
    read = reader.read;
    read_context = reader.context;
  } else {
    context = {
        .telemetry = &telemetry,
        .handle = handle,
    };
    read = &read_telemetry;
    read_context = &context;
  }
  fast_updates = modified;
  return read != nullptr && read_context != nullptr;
}

bool build(const Layout& layout, const Config& config, const char* const tag,
           const std::int32_t content_width, const std::int32_t content_height,
           const bool fill_available_width, const fonts::Registry& fonts,
           lv_obj_t*& parent, Rect& bounds, Box& box) {
  if (!internal::resolve_frame_box(layout, config, tag, content_width,
                                   content_height, fill_available_width, fonts,
                                   parent, bounds, box.caption_height)) {
    return false;
  }
  box.container = lv_obj_create(parent);
  lv_obj_remove_style_all(box.container);
  style_container(config, bounds, box.container);
  if (config.background_inset_px == 0) {
    internal::build_caption(config, fonts, parent, bounds, box);
    return true;
  }
  box.background_fill = lv_obj_create(box.container);
  lv_obj_remove_style_all(box.background_fill);
  style_background_fill(config, bounds, box.background_fill);
  internal::build_caption(config, fonts, parent, bounds, box);
  return true;
}

bool update(const Layout& layout, const Config& config, const char* const tag,
            const std::int32_t content_width, const std::int32_t content_height,
            const bool fill_available_width, const fonts::Registry& fonts,
            Box& box, Rect* const resolved_bounds) {
  if (box.container == nullptr) {
    return false;
  }
  lv_obj_t* parent{};
  Rect bounds{};
  if (!internal::resolve_frame_box(layout, config, tag, content_width,
                                   content_height, fill_available_width, fonts,
                                   parent, bounds, box.caption_height)) {
    return false;
  }
  const bool paints_container = config.background_inset_px == 0;
  if (paints_container == (box.background_fill != nullptr)) {
    return false;
  }
  if (parent != lv_obj_get_parent(box.container)) {
    lv_obj_set_parent(box.container, parent);
  }
  style_container(config, bounds, box.container);
  if (!paints_container) {
    style_background_fill(config, bounds, box.background_fill);
  }
  box.caption = nullptr;
  box.caption_mask = {};
  internal::build_caption(config, fonts, parent, bounds, box);
  if (resolved_bounds != nullptr) {
    *resolved_bounds = bounds;
  }
  return true;
}

}
