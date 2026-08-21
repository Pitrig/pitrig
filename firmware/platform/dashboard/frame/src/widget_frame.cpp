#include "widget_frame.hpp"

#include <algorithm>

#include "dashboard_layout_internal.hpp"
#include "lvgl.h"
#include "telemetry_state.hpp"
#include "widget_frame_internal.hpp"

// The styling and lifecycle half of the frame: what a container's objects are
// painted with, and the build/update ordering around them. Where the box lands
// and the caption that overhangs it are resolved in frame_geometry.cpp.
namespace simcore::dashboard::frame {
namespace {

// The gradient a background paints, on whichever object carries it. It costs
// nothing where none is configured. A rule that repaints the background
// replaces only the near colour, which keeps the gradient the widget was
// authored with.
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

// Every style the container itself carries, applied to an object that already
// exists. Written apart from the creation below because an in-place update
// applies exactly this set to the object it is keeping: a container that is
// deleted and rebuilt takes its children with it, so a frame holding any has
// to be restyled rather than replaced.
void style_container(const Config& config, const Rect& bounds,
                     lv_obj_t* const container) {
  const bool has_background =
      config.background_color != configuration::kTransparentColor;
  // An inset background cannot be the container's own fill, which always
  // reaches the border, so it becomes a child sized to leave the frame clear.
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
  lv_obj_set_style_pad_left(container, config.padding.left, LV_PART_MAIN);
  lv_obj_set_style_pad_top(container, config.padding.top, LV_PART_MAIN);
  lv_obj_set_style_pad_right(container, config.padding.right, LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(container, config.padding.bottom, LV_PART_MAIN);
  lv_obj_remove_flag(container, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(container, LV_OBJ_FLAG_CLICKABLE);
  apply_debug_widget_outline(container);
}

// The inset background's geometry and paint. LVGL places a child against the
// parent's content area, which the border and the padding already push inwards,
// so the padding is subtracted back out to leave exactly `inset` of frame
// showing.
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
  lv_obj_set_style_radius(
      fill, std::max<std::int32_t>(config.border.radius_px - inset, 0),
      LV_PART_MAIN);
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

}  // namespace

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
  // Exactly one modifier is what the contract allows today, so a longer list
  // is not a pipeline here — it reads unmodified, the way it always has.
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
  // A module reader produces values between telemetry updates — that is what
  // makes it a modifier rather than a transform — so anything it feeds renders
  // on the fast path.
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
  // Created before any content so it stays behind it.
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
  // An inset background appearing or disappearing is not a restyle: it adds or
  // removes a child of the container. Answered before anything is written, so a
  // caller that is told no still holds the frame it had and can fall back to the
  // composition that rebuilds it.
  const bool paints_container = config.background_inset_px == 0;
  if (paints_container == (box.background_fill != nullptr)) {
    return false;
  }
  // A widget dragged into a panel, or out of one, changes which LVGL tree it
  // belongs to. The object moves rather than being rebuilt, because what it
  // holds moves with it — a container rebuilt in its new parent would arrive
  // empty. LVGL appends it to its new siblings; the z-order pass settles that
  // afterwards, as it does for every rebuilt widget.
  if (parent != lv_obj_get_parent(box.container)) {
    lv_obj_set_parent(box.container, parent);
  }
  style_container(config, bounds, box.container);
  if (!paints_container) {
    style_background_fill(config, bounds, box.background_fill);
  }
  // The caption and its mask are built rather than restyled, because whether
  // there is a mask at all is decided by the geometry the caption ends up with.
  // They sit on the parent, so nothing of the widget's own hangs off them —
  // and the ones they replace are the painter's to delete, which is what makes
  // this safe to run before the caller releases it.
  box.caption = nullptr;
  box.caption_gap = nullptr;
  internal::build_caption(config, fonts, parent, bounds, box);
  if (resolved_bounds != nullptr) {
    *resolved_bounds = bounds;
  }
  return true;
}

}  // namespace simcore::dashboard::frame
