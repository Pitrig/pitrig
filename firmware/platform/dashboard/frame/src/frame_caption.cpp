#include "lvgl.h"
#include "value_text.hpp"
#include "widget_frame_internal.hpp"

namespace pitrig::dashboard::frame {
namespace {

constexpr configuration::ValueTransform kPlainText{};

}

void Painter::bind_caption(const ValueReadCallback read, void* const context) {
  caption_read_ = read;
  caption_context_ = context;
}

void Painter::place_caption() {
  const std::int32_t width = internal::caption_width(caption_layout_.font, caption_text_.data());
  const Rect position = internal::caption_position(caption_layout_, width);
  const bool masked = caption_mask_.present;
  caption_mask_ = internal::caption_mask_for(caption_layout_, width, caption_mask_.rgb);
  lv_label_set_text_static(box_.caption, caption_text_.data());
  lv_obj_set_pos(box_.caption, position.x, position.y);
  if (masked || caption_mask_.present) {
    lv_obj_invalidate(box_.container);
  }
}

void Painter::render_caption() {
  if (caption_read_ == nullptr || box_.caption == nullptr) {
    return;
  }
  const telemetry::TelemetryRead value = caption_read_(caption_context_);
  if (caption_rendered_ && value.revision == caption_revision_ &&
      value.available == caption_available_) {
    return;
  }
  caption_revision_ = value.revision;
  caption_available_ = value.available;
  caption_rendered_ = true;
  value_text::Buffer next{};
  if (!value_text::transform_value(kPlainText, value, next) || next.front() == '\0') {
    value_text::copy_text(next, caption_fallback_);
  }
  if (next == caption_text_) {
    return;
  }
  caption_text_ = next;
  place_caption();
}

}
