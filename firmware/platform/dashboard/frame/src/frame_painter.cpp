#include "widget_frame.hpp"

#include "lvgl.h"
#include "widget_conditions.hpp"

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
      resolution.style = held_style_;
    } else {
      holding_ = false;
    }
    apply_style(resolution.style);
  }
  apply_blink();
}

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
    blink_started_ = lv_tick_get();
    blink_visible_ = true;
  }
  applied_style_ = style;
  apply_visibility();
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

}
