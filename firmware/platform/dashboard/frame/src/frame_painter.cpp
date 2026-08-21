#include "widget_frame.hpp"

#include "lvgl.h"
#include "widget_conditions.hpp"

// The only part of a frame that runs on every LVGL pass. Building one is a
// composition-time concern and lives beside build() in widget_frame.cpp; what
// is here reads a bound value, resolves the styling rules over it, and touches
// LVGL only when something actually changed.
namespace simcore::dashboard::frame {

void Painter::configure(const Config& config, const Box& box,
                        const std::uint32_t content_color,
                        const ApplyContentColor apply_color,
                        void* const color_context) {
  box_ = box;
  attachment_count_ = 0;
  for (lv_obj_t* const object : {box.caption_gap, box.caption}) {
    if (object != nullptr && attachment_count_ < attachments_.size()) {
      attachments_[attachment_count_++] = object;
    }
  }
  if (box.caption_gap != nullptr) {
    background_mask_ = box.caption_gap;
    background_mask_rgb_ =
        lv_color_to_u32(lv_obj_get_style_bg_color(box.caption_gap,
                                                  LV_PART_MAIN)) &
        0x00FF'FFFFU;
  }
  apply_color_ = apply_color;
  color_context_ = color_context;
  condition_count_ =
      std::min<std::size_t>(config.condition_count, conditions_.size());
  for (std::size_t index = 0; index < condition_count_; ++index) {
    conditions_[index] = config.conditions[index];
  }
  ramp_stop_count_ =
      std::min<std::size_t>(config.color_ramp.stop_count, ramp_stops_.size());
  ramp_target_ = config.color_ramp.target;
  for (std::size_t index = 0; index < ramp_stop_count_; ++index) {
    ramp_stops_[index] = config.color_ramp.stops[index];
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
  // What this claims about LVGL has to be true of LVGL. A build hands over
  // fresh objects, which are visible; an update hands over the ones the widget
  // was already drawing with, and a rule that hid it — or a blink caught in its
  // dark half — left the flag on them. Nothing would take it off again: the
  // resolution below only writes visibility where it changes, and as far as
  // this painter is now concerned it never did.
  const auto show = [](lv_obj_t* const object) {
    if (object != nullptr) {
      lv_obj_remove_flag(object, LV_OBJ_FLAG_HIDDEN);
    }
  };
  show(box.container);
  for (std::size_t index = 0; index < attachment_count_; ++index) {
    show(attachments_[index]);
  }
}

void Painter::bind(const ValueReadCallback read, void* const context) {
  read_ = read;
  read_context_ = context;
}

void Painter::release() {
  // The caption and its mask sit on the parent, so deleting the container would
  // leave them behind.
  for (lv_obj_t* const object : {box_.caption, box_.caption_gap}) {
    if (object != nullptr) {
      lv_obj_delete(object);
    }
  }
  *this = Painter{};
}

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
  // Styling is re-resolved when the watched value moved, while a hold runs
  // down, and while a blink is on. A widget with neither rules nor a ramp never
  // enters this at all.
  if ((condition_count_ > 0 || ramp_stop_count_ >= 2) &&
      (changed || holding_ || applied_style_.blink_ms != 0)) {
    const std::optional<double> numeric = conditions::condition_value(value);
    conditions::Resolution resolution = conditions::resolve(
        {conditions_.data(), condition_count_}, numeric, ramped(numeric));
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

// The authored style with the ramp's colour in place of the one it paints. This
// is what the rules fall back to, which is what makes the ramp the base layer
// rather than a competing mechanism.
conditions::ResolvedStyle Painter::ramped(
    const std::optional<double> value) const {
  conditions::ResolvedStyle style = static_style_;
  const std::optional<std::uint32_t> color =
      conditions::ramp_color({ramp_stops_.data(), ramp_stop_count_}, value);
  if (!color.has_value()) {
    return style;
  }
  switch (ramp_target_) {
    case configuration::ColorRampTarget::content:
      style.color = *color;
      break;
    case configuration::ColorRampTarget::background:
      style.background_color = *color;
      break;
    case configuration::ColorRampTarget::border:
      style.border_color = *color;
      break;
  }
  return style;
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
