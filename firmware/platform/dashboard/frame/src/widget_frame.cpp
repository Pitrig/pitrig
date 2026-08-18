#include "widget_frame.hpp"

#include <algorithm>

#include "dashboard_layout_internal.hpp"
#include "telemetry_state.hpp"
#include "logger.hpp"
#include "lvgl.h"

namespace simcore::dashboard::frame {
namespace {

[[nodiscard]] std::int32_t text_width(const lv_font_t* const font,
                                      const char* const text) {
  lv_point_t size{};
  lv_text_get_size(&size, text, font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
  return size.x;
}

// The colour showing behind the widget, so the caption mask can hide the border
// line without knowing what it is standing on.
[[nodiscard]] lv_color_t background_behind(const lv_obj_t* object) {
  while (object != nullptr) {
    if (lv_obj_get_style_bg_opa(object, LV_PART_MAIN) > LV_OPA_TRANSP) {
      return lv_obj_get_style_bg_color(object, LV_PART_MAIN);
    }
    object = lv_obj_get_parent(object);
  }
  return lv_color_black();
}

// The two axes of a nine-point anchor, so a placement rule can be written once
// per axis instead of once per anchor. Spelled out rather than derived from the
// enum's order, which the contract is free to change.
enum class Column : std::uint8_t { left, center, right };
enum class Row : std::uint8_t { top, middle, bottom };

struct Anchor {
  Column column{};
  Row row{};
};

[[nodiscard]] Anchor anchor_of(const configuration::TextAlignment alignment) {
  using A = configuration::TextAlignment;
  switch (alignment) {
    case A::top_left:
      return {Column::left, Row::top};
    case A::top_center:
      return {Column::center, Row::top};
    case A::top_right:
      return {Column::right, Row::top};
    case A::left:
      return {Column::left, Row::middle};
    case A::center:
      return {Column::center, Row::middle};
    case A::right:
      return {Column::right, Row::middle};
    case A::bottom_left:
      return {Column::left, Row::bottom};
    case A::bottom_center:
      return {Column::center, Row::bottom};
    case A::bottom_right:
      return {Column::right, Row::bottom};
  }
  return {Column::center, Row::middle};
}

// Where the caption sits on the widget's outer box. The outer box rather than
// the content area, because the caption belongs to the frame line and not to
// what the widget draws inside it.
[[nodiscard]] Rect caption_rect(const Config& config, const Rect& bounds,
                                const std::int32_t width,
                                const std::int32_t height) {
  const Anchor anchor = anchor_of(config.title.alignment);
  std::int32_t x = bounds.x;
  switch (anchor.column) {
    case Column::left:
      break;
    case Column::center:
      x += (bounds.width - width) / 2;
      break;
    case Column::right:
      x += bounds.width - width;
      break;
  }
  // The top and bottom rows straddle their border line, which is what lets the
  // caption break it. The middle row sits inside the box like any content, so a
  // caption anchored there breaks nothing.
  std::int32_t y = bounds.y - height / 2;
  switch (anchor.row) {
    case Row::top:
      break;
    case Row::middle:
      y = bounds.y + (bounds.height - height) / 2;
      break;
    case Row::bottom:
      y = bounds.y + bounds.height - height / 2;
      break;
  }
  return {.x = x + config.title.offset_x_px,
          .y = y + config.title.offset_y_px,
          .width = width,
          .height = height};
}

// The mask that hides the frame line under the caption. It stays a thin band
// along one border rather than covering the caption's whole box: the mask sits
// above the container, so anything taller would paint over the widget's own
// content. It is clipped to the box for the same reason in reverse — the band
// may cover frame line, never the parent outside it. A caption that crosses no
// border has nothing to hide, and reports none.
[[nodiscard]] bool caption_gap_rect(const Config& config, const Rect& bounds,
                                    const Rect& caption, Rect& gap) {
  const std::int32_t line = config.border.width_px;
  if (!config.title.border_gap || line <= 0) {
    return false;
  }
  const std::int32_t pad = config.title.gap_padding_px;
  const std::int32_t left = caption.x - pad;
  const std::int32_t right = caption.x + caption.width + pad;
  const std::int32_t top = caption.y - pad;
  const std::int32_t bottom = caption.y + caption.height + pad;
  const std::int32_t box_right = bounds.x + bounds.width;
  const std::int32_t box_bottom = bounds.y + bounds.height;
  const std::int32_t span_left = std::max(left, bounds.x);
  const std::int32_t span_right = std::min(right, box_right);
  const std::int32_t span_top = std::max(top, bounds.y);
  const std::int32_t span_bottom = std::min(bottom, box_bottom);
  const std::int32_t thickness = line + 2;
  const bool spans_x = span_right > span_left;
  const bool spans_y = span_bottom > span_top;
  // A horizontal border wins a corner, because a caption is a horizontal run of
  // text and that is the line it reads as breaking.
  if (spans_x && top < bounds.y + line && bottom > bounds.y) {
    gap = {span_left, bounds.y, span_right - span_left, thickness};
  } else if (spans_x && bottom > box_bottom - line && top < box_bottom) {
    gap = {span_left, box_bottom - thickness, span_right - span_left, thickness};
  } else if (spans_y && left < bounds.x + line && right > bounds.x) {
    gap = {bounds.x, span_top, thickness, span_bottom - span_top};
  } else if (spans_y && right > box_right - line && left < box_right) {
    gap = {box_right - thickness, span_top, thickness, span_bottom - span_top};
  } else {
    return false;
  }
  return true;
}

// Creates the caption, plus the mask that hides the border line behind it.
// Both sit on the parent so the border can pass behind.
}  // namespace

bool caption_mask_reads_parent(const Config& config) {
  const bool paints_own_fill =
      config.background_color != configuration::kTransparentColor &&
      config.background_inset_px == 0;
  return !paints_own_fill;
}

namespace {

void build_caption(const Config& config, const fonts::Registry& fonts,
                   lv_obj_t* const parent, const Rect& bounds, Box& box) {
  if (config.title.text.front() == '\0') {
    return;
  }
  const lv_font_t* const title_font = fonts.resolve(config.title.font);
  if (title_font == nullptr) {
    return;
  }
  const Rect caption =
      caption_rect(config, bounds, text_width(title_font, config.title.text.data()),
                   lv_font_get_line_height(title_font));
  if (Rect gap{}; caption_gap_rect(config, bounds, caption, gap)) {
    box.caption_gap = lv_obj_create(parent);
    lv_obj_remove_style_all(box.caption_gap);
    lv_obj_set_size(box.caption_gap, gap.width, gap.height);
    lv_obj_set_pos(box.caption_gap, gap.x, gap.y);
    // An inset background leaves the frame line over the parent, not over the
    // widget's own fill, so the mask matches whatever is painted there.
    const lv_color_t gap_color =
        caption_mask_reads_parent(config)
            ? background_behind(parent)
            : lv_color_hex(config.background_color);
    lv_obj_set_style_bg_color(box.caption_gap, gap_color, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(box.caption_gap, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_remove_flag(box.caption_gap, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(box.caption_gap, LV_OBJ_FLAG_CLICKABLE);
  }

  box.caption = lv_label_create(parent);
  lv_obj_remove_style_all(box.caption);
  // Copied rather than kept by pointer: the caption text is set once at build
  // time, so LVGL owning it costs one allocation and no lifetime question.
  lv_label_set_text(box.caption, config.title.text.data());
  lv_obj_set_style_text_font(box.caption, title_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(box.caption, lv_color_hex(config.title.color),
                              LV_PART_MAIN);
  lv_obj_set_pos(box.caption, caption.x, caption.y);
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

bool bind_source(const std::string_view name,
                 const std::uint8_t modifier_count,
                 const std::span<const configuration::ValueModifier> modifiers,
                 const telemetry::ITelemetryRegistry& registry,
                 const telemetry::ITelemetryReader& telemetry,
                 const ModifierReader lap_timer_modifier,
                 SourceContext& context, ValueReadCallback& read,
                 void*& read_context, bool& fast_updates) {
  const telemetry::Handle handle = registry.resolve(name);
  if (!handle.valid()) {
    return false;
  }
  const bool lap_timer_modified =
      modifier_count == 1 &&
      modifiers.front().type == configuration::ValueModifierType::lap_timer;
  if (lap_timer_modified) {
    read = lap_timer_modifier.read;
    read_context = lap_timer_modifier.context;
  } else {
    context = {
        .telemetry = &telemetry,
        .handle = handle,
    };
    read = &read_telemetry;
    read_context = &context;
  }
  fast_updates = lap_timer_modified;
  return read != nullptr && read_context != nullptr;
}

bool build(const Layout& layout, const Config& config, const char* const tag,
           const std::int32_t content_width, const std::int32_t content_height,
           const bool fill_available_width, const fonts::Registry& fonts,
           lv_obj_t*& parent, Rect& bounds, Box& box) {
  const bool has_title = config.title.text.front() != '\0';
  const lv_font_t* const title_font =
      has_title ? fonts.resolve(config.title.font) : nullptr;
  if (has_title && title_font == nullptr) {
    log::error(tag, "Widget title font is unavailable");
    return false;
  }
  const std::int32_t title_width =
      has_title ? text_width(title_font, config.title.text.data()) : 0;
  const std::int32_t title_height =
      has_title ? lv_font_get_line_height(title_font) : 0;
  box.caption_height = title_height;
  // Where the caption is placed is authored, but the room a widget reserves for
  // it is not: it is the default placement — straddling the top border, so half
  // of it is the widget's own business and the rest overhangs — so that moving
  // the caption or turning its border gap off never resizes the widget.
  const std::int32_t caption_width =
      has_title ? title_width + 2 * config.title.gap_padding_px : 0;
  const std::int32_t framed_width = std::max(content_width, caption_width);
  const std::int32_t framed_height = content_height + title_height / 2;
  const std::int32_t horizontal_insets =
      2 * config.border.width_px + config.padding.left + config.padding.right;
  const std::int32_t vertical_insets =
      2 * config.border.width_px + config.padding.top + config.padding.bottom;
  if (!resolve_widget_bounds(layout, config, config.placement,
                             framed_width + horizontal_insets,
                             framed_height + vertical_insets,
                             fill_available_width, parent, bounds) ||
      bounds.width <= horizontal_insets || bounds.height <= vertical_insets) {
    // Font metrics come from the uploaded face, so a placement authored against
    // different metrics can be too small. Report what it would have taken.
    log::error(tag, "Widget needs %dx%d but is placed at %dx%d",
               static_cast<int>(framed_width + horizontal_insets),
               static_cast<int>(framed_height + vertical_insets),
               static_cast<int>(config.placement.width),
               static_cast<int>(config.placement.height));
    return false;
  }

  const bool has_background =
      config.background_color != configuration::kTransparentColor;
  // A gradient is two style properties on whichever object paints the
  // background, so it costs nothing where it is not configured. A rule that
  // repaints the background replaces only the near colour, which keeps the
  // gradient the widget was authored with.
  const auto apply_background_gradient = [&config](lv_obj_t* const object) {
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
  };
  // An inset background cannot be the container's own fill, which always
  // reaches the border, so it becomes a child sized to leave the frame clear.
  const std::int32_t inset = config.background_inset_px;
  const bool paints_container = inset == 0;

  box.container = lv_obj_create(parent);
  lv_obj_remove_style_all(box.container);
  lv_obj_set_pos(box.container, bounds.x, bounds.y);
  lv_obj_set_size(box.container, bounds.width, bounds.height);
  if (has_background && paints_container) {
    lv_obj_set_style_bg_color(
        box.container, lv_color_hex(config.background_color), LV_PART_MAIN);
    apply_background_gradient(box.container);
  }
  lv_obj_set_style_bg_opa(
      box.container,
      has_background && paints_container ? LV_OPA_COVER : LV_OPA_TRANSP,
      LV_PART_MAIN);
  lv_obj_set_style_border_color(
      box.container, lv_color_hex(config.border.color), LV_PART_MAIN);
  lv_obj_set_style_border_width(box.container, config.border.width_px,
                                LV_PART_MAIN);
  lv_obj_set_style_border_opa(
      box.container, config.border.width_px == 0 ? LV_OPA_TRANSP : LV_OPA_COVER,
      LV_PART_MAIN);
  lv_obj_set_style_radius(box.container, config.border.radius_px, LV_PART_MAIN);
  lv_obj_set_style_pad_left(box.container, config.padding.left, LV_PART_MAIN);
  lv_obj_set_style_pad_top(box.container, config.padding.top, LV_PART_MAIN);
  lv_obj_set_style_pad_right(box.container, config.padding.right, LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(box.container, config.padding.bottom,
                              LV_PART_MAIN);
  lv_obj_remove_flag(box.container, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(box.container, LV_OBJ_FLAG_CLICKABLE);
  apply_debug_widget_outline(box.container);

  if (paints_container) {
    build_caption(config, fonts, parent, bounds, box);
    return true;
  }
  // Created before any content so it stays behind it. LVGL places a child
  // against the parent's content area, which the border and the padding already
  // push inwards, so the padding is subtracted back out to leave exactly
  // `inset` of frame showing.
  const std::int32_t edge = config.border.width_px + inset;
  box.background_fill = lv_obj_create(box.container);
  lv_obj_remove_style_all(box.background_fill);
  lv_obj_set_pos(box.background_fill,
                 inset - static_cast<std::int32_t>(config.padding.left),
                 inset - static_cast<std::int32_t>(config.padding.top));
  lv_obj_set_size(box.background_fill,
                  std::max<std::int32_t>(bounds.width - 2 * edge, 0),
                  std::max<std::int32_t>(bounds.height - 2 * edge, 0));
  lv_obj_set_style_radius(
      box.background_fill,
      std::max<std::int32_t>(config.border.radius_px - inset, 0), LV_PART_MAIN);
  if (has_background) {
    lv_obj_set_style_bg_color(box.background_fill,
                              lv_color_hex(config.background_color),
                              LV_PART_MAIN);
    apply_background_gradient(box.background_fill);
  }
  lv_obj_set_style_bg_opa(box.background_fill,
                          has_background ? LV_OPA_COVER : LV_OPA_TRANSP,
                          LV_PART_MAIN);
  lv_obj_remove_flag(box.background_fill, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(box.background_fill, LV_OBJ_FLAG_CLICKABLE);
  build_caption(config, fonts, parent, bounds, box);
  return true;
}

}  // namespace simcore::dashboard::frame
