#include <algorithm>

#include "dashboard_layout_internal.hpp"
#include "logger.hpp"
#include "lvgl.h"
#include "widget_frame_internal.hpp"

namespace simcore::dashboard::frame {
namespace {

[[nodiscard]] std::int32_t text_width(const lv_font_t* const font,
                                      const char* const text) {
  lv_point_t size{};
  lv_text_get_size(&size, text, font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
  return size.x;
}

[[nodiscard]] lv_color_t background_behind(const lv_obj_t* object) {
  while (object != nullptr) {
    if (lv_obj_get_style_bg_opa(object, LV_PART_MAIN) > LV_OPA_TRANSP) {
      return lv_obj_get_style_bg_color(object, LV_PART_MAIN);
    }
    object = lv_obj_get_parent(object);
  }
  return lv_color_black();
}

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

}

namespace internal {

bool resolve_frame_box(const Layout& layout, const Config& config,
                       const char* const tag, const std::int32_t content_width,
                       const std::int32_t content_height,
                       const bool fill_available_width,
                       const fonts::Registry& fonts, lv_obj_t*& parent,
                       Rect& bounds, std::int32_t& caption_height) {
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
  caption_height = title_height;
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
    log::error(tag, "Widget needs %dx%d but is placed at %dx%d",
               static_cast<int>(framed_width + horizontal_insets),
               static_cast<int>(framed_height + vertical_insets),
               static_cast<int>(config.placement.width),
               static_cast<int>(config.placement.height));
    return false;
  }
  return true;
}

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
  lv_label_set_text(box.caption, config.title.text.data());
  lv_obj_set_style_text_font(box.caption, title_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(box.caption, lv_color_hex(config.title.color),
                              LV_PART_MAIN);
  lv_obj_set_pos(box.caption, caption.x, caption.y);
}

}
}
