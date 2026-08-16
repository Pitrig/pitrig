#include "widget_frame.hpp"

#include <algorithm>

#include "dashboard_layout_internal.hpp"
#include "logger.hpp"
#include "lvgl.h"

namespace simcore::dashboard::frame {

bool build(const Layout& layout, const Config& config, const char* const tag,
           const std::int32_t content_width, const std::int32_t content_height,
           const bool fill_available_width, lv_obj_t*& parent, Rect& bounds,
           Box& box) {
  const std::int32_t horizontal_insets =
      2 * config.border.width_px + config.padding.left + config.padding.right;
  const std::int32_t vertical_insets =
      2 * config.border.width_px + config.padding.top + config.padding.bottom;
  if (!resolve_widget_bounds(layout, config.placement,
                             content_width + horizontal_insets,
                             content_height + vertical_insets,
                             fill_available_width, parent, bounds) ||
      bounds.width <= horizontal_insets || bounds.height <= vertical_insets) {
    // Font metrics come from the uploaded face, so a placement authored against
    // different metrics can be too small. Report what it would have taken.
    log::error(tag, "Widget needs %dx%d but is placed at %dx%d",
               static_cast<int>(content_width + horizontal_insets),
               static_cast<int>(content_height + vertical_insets),
               static_cast<int>(config.placement.width),
               static_cast<int>(config.placement.height));
    return false;
  }

  const bool has_background =
      config.background_color != configuration::kTransparentColor;
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
  }
  lv_obj_set_style_bg_opa(box.background_fill,
                          has_background ? LV_OPA_COVER : LV_OPA_TRANSP,
                          LV_PART_MAIN);
  lv_obj_remove_flag(box.background_fill, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(box.background_fill, LV_OBJ_FLAG_CLICKABLE);
  return true;
}

void Painter::configure(const Config& config, const Box& box,
                        const std::span<lv_obj_t* const> attachments,
                        const std::uint32_t content_color,
                        const ApplyContentColor apply_color,
                        void* const color_context) {
  box_ = box;
  attachment_count_ = std::min(attachments.size(), attachments_.size());
  std::copy_n(attachments.begin(), attachment_count_, attachments_.begin());
  apply_color_ = apply_color;
  color_context_ = color_context;
  condition_count_ =
      std::min<std::size_t>(config.condition_count, conditions_.size());
  for (std::size_t index = 0; index < condition_count_; ++index) {
    conditions_[index] = config.conditions[index];
  }
  // The widget as authored is what every rule falls back to, and what build()
  // just configured LVGL with, so the first render has nothing to apply.
  static_style_ = {
      .color = content_color,
      .background_color = config.background_color,
      .border_color = config.border.color,
      .blink_ms = 0,
      .hidden = false,
  };
  applied_style_ = static_style_;
  blink_visible_ = true;
  visible_ = true;
}

void Painter::set_background_mask(lv_obj_t* const object,
                                  const std::uint32_t fallback_rgb) {
  background_mask_ = object;
  background_mask_rgb_ = fallback_rgb;
}

void Painter::bind(const ValueReadCallback read, void* const context) {
  read_ = read;
  read_context_ = context;
}

void Painter::release() { *this = Painter{}; }

void Painter::render() {
  const telemetry::TelemetryRead value =
      read_ != nullptr ? read_(read_context_) : telemetry::TelemetryRead{};
  bool changed = false;
  if (read_ != nullptr) {
    changed = value.revision != rendered_revision_ ||
              value.available != rendered_available_;
    rendered_revision_ = value.revision;
    rendered_available_ = value.available;
  }
  // Rules are re-resolved when the watched value moved, while a hold runs down,
  // and while a blink is on. A widget with no rules never enters this at all.
  if (condition_count_ > 0 &&
      (changed || holding_ || applied_style_.blink_ms != 0)) {
    conditions::Resolution resolution =
        conditions::resolve({conditions_.data(), condition_count_},
                            conditions::condition_value(value), static_style_);
    if (resolution.matched) {
      held_style_ = resolution.style;
      hold_ms_ = resolution.hold_ms;
      hold_started_ = lv_tick_get();
      holding_ = resolution.hold_ms > 0;
    } else if (holding_ && lv_tick_elaps(hold_started_) < hold_ms_) {
      // The rule stopped matching but its flash has not run out yet, which is
      // what makes a momentary trigger visible at all.
      resolution.style = held_style_;
    } else {
      holding_ = false;
    }
    apply_style(resolution.style);
  }
  // A blink runs off the tick rather than off telemetry, so its phase advances
  // even on a pass where nothing else moved.
  apply_blink();
}

void Painter::apply_style(const conditions::ResolvedStyle& style) {
  if (style == applied_style_ || box_.container == nullptr) {
    return;
  }
  if (style.color != applied_style_.color && apply_color_ != nullptr) {
    apply_color_(color_context_, style.color);
  }
  if (style.background_color != applied_style_.background_color) {
    const bool painted =
        style.background_color != configuration::kTransparentColor;
    lv_obj_t* const filled = box_.background_fill != nullptr
                                 ? box_.background_fill
                                 : box_.container;
    if (painted) {
      lv_obj_set_style_bg_color(filled, lv_color_hex(style.background_color),
                                LV_PART_MAIN);
    }
    lv_obj_set_style_bg_opa(filled, painted ? LV_OPA_COVER : LV_OPA_TRANSP,
                            LV_PART_MAIN);
    if (background_mask_ != nullptr && box_.background_fill == nullptr) {
      // An inset background never reaches what the mask covers, so the mask
      // only follows a background the container itself paints.
      lv_obj_set_style_bg_color(
          background_mask_,
          lv_color_hex(painted ? style.background_color : background_mask_rgb_),
          LV_PART_MAIN);
    }
  }
  if (style.border_color != applied_style_.border_color) {
    lv_obj_set_style_border_color(
        box_.container, lv_color_hex(style.border_color), LV_PART_MAIN);
  }
  if (style.blink_ms != applied_style_.blink_ms) {
    // Anchor the phase to the change, so the frame that turns the widget red is
    // one the widget is visible in instead of one it happens to blink out on.
    blink_started_ = lv_tick_get();
    blink_visible_ = true;
  }
  applied_style_ = style;
  apply_visibility();
  // Border, background and content are one visual change. Invalidating the
  // whole widget publishes them as a single area, instead of leaving LVGL with
  // separate rectangles that a partial draw buffer can flush one after another.
  lv_obj_invalidate(box_.container);
  for (std::size_t index = 0; index < attachment_count_; ++index) {
    if (attachments_[index] != nullptr) {
      lv_obj_invalidate(attachments_[index]);
    }
  }
}

void Painter::apply_blink() {
  const std::uint32_t period = applied_style_.blink_ms;
  const bool phase =
      period == 0 || (lv_tick_elaps(blink_started_) % period) < period / 2U;
  if (phase == blink_visible_) {
    return;
  }
  blink_visible_ = phase;
  apply_visibility();
}

void Painter::apply_visibility() {
  const bool visible = !applied_style_.hidden && blink_visible_;
  if (visible == visible_ || box_.container == nullptr) {
    return;
  }
  visible_ = visible;
  // A blink hides the whole widget rather than its content alone, so the box,
  // the frame and anything attached to it pulse together.
  const auto set = [visible](lv_obj_t* const object) {
    if (object == nullptr) {
      return;
    }
    if (visible) {
      lv_obj_remove_flag(object, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(object, LV_OBJ_FLAG_HIDDEN);
    }
  };
  set(box_.container);
  for (std::size_t index = 0; index < attachment_count_; ++index) {
    set(attachments_[index]);
  }
}

}  // namespace simcore::dashboard::frame
