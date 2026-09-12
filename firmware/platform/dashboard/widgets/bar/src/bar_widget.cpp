#include "bar_widget.hpp"

#include <algorithm>

#include "lvgl.h"
#include "value_conditions.hpp"
#include "widget_inner_box.hpp"

namespace pitrig::dashboard::bar_widget {
namespace {

constexpr char kTag[] = "bar_widget";

static_assert(LV_GRADIENT_MAX_STOPS >= 3);

[[nodiscard]] bool horizontal(const State& state) {
  return state.orientation == configuration::BarOrientation::horizontal;
}

void add_stop(lv_grad_dsc_t& grad, const std::uint32_t rgb, const float fraction) {
  grad.stops[grad.stops_count++] = {.color = lv_color_hex(rgb),
                                    .opa = LV_OPA_COVER,
                                    .frac = static_cast<std::uint8_t>(fraction * 255.0F + 0.5F)};
}

void paint_fill(State& state) {
  if (!state.gradient) {
    lv_obj_set_style_bg_color(state.fill, lv_color_hex(state.ramp.from), LV_PART_MAIN);
    return;
  }
  const std::int32_t span = horizontal(state) ? state.inner_width : state.inner_height;
  const auto last = static_cast<float>(std::max<std::int32_t>(span - 1, 1));
  const auto near_px =
      static_cast<float>(std::clamp<std::int32_t>(state.drawn_offset, 0, span - 1));
  const float far_px =
      std::clamp(static_cast<float>(state.drawn_offset + state.drawn_length - 1), near_px, last);
  const std::uint32_t near = fill::color_at(state.ramp, near_px / last);
  const std::uint32_t far = fill::color_at(state.ramp, far_px / last);
  const bool from_axis_start = horizontal(state) != state.inverted;
  lv_grad_dsc_t& grad = state.grad;
  grad.stops_count = 0;
  add_stop(grad, from_axis_start ? near : far, 0.0F);
  const float mid_px = last / 2.0F;
  if (state.ramp.has_via && near_px < mid_px && mid_px < far_px) {
    const float along = (mid_px - near_px) / (far_px - near_px);
    add_stop(grad, state.ramp.via, from_axis_start ? along : 1.0F - along);
  }
  add_stop(grad, from_axis_start ? far : near, 1.0F);
  lv_obj_invalidate(state.fill);
}

void apply_fill_color(void* const context, const std::uint32_t rgb) {
  auto& state = *static_cast<State*>(context);
  state.ramp.from = rgb;
  paint_fill(state);
}

}

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const frame::ValueBinding& binding, const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent, bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.read = binding.read;
  state.read_context = binding.read_context;
  state.range = config.range;
  state.origin_fraction =
      config.origin_present ? conditions::range_fraction(config.origin, config.range) : 0.0F;
  state.orientation = config.orientation;
  state.inverted = config.inverted;
  state.free_running = binding.fast_updates;

  const std::int32_t border = config.frame.border.width_px;
  const InnerBox inner = inner_box(config.frame, bounds);
  state.inner_width = inner.width;
  state.inner_height = inner.height;
  state.origin_x = 0;
  state.origin_y = 0;

  state.ramp = fill::ramp(config.fill_color, config.fill_grad_mid_color, config.fill_grad_color);
  state.gradient = config.fill_grad_color != configuration::kTransparentColor;
  state.fill = lv_obj_create(box.container);
  lv_obj_remove_style_all(state.fill);
  lv_obj_set_style_bg_opa(state.fill, LV_OPA_COVER, LV_PART_MAIN);
  if (state.gradient) {
    state.grad = {};
    state.grad.dir = horizontal(state) ? LV_GRAD_DIR_HOR : LV_GRAD_DIR_VER;
    state.grad.extend = LV_GRAD_EXTEND_PAD;
    lv_obj_set_style_bg_grad(state.fill, &state.grad, LV_PART_MAIN);
  }
  lv_obj_set_style_radius(state.fill, frame::fill_radius(config.frame, border), LV_PART_MAIN);
  lv_obj_remove_flag(state.fill, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(state.fill, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_pos(state.fill, state.origin_x, state.origin_y);
  lv_obj_set_size(state.fill, 0, 0);
  state.drawn_length = -1;
  paint_fill(state);

  state.painter.configure(config.frame, box, config.fill_color, &apply_fill_color, &state);
  state.painter.bind(binding.condition_read, binding.condition_context);
  state.painter.bind_caption(binding.caption_read, binding.caption_context);
  return true;
}

void Collection::render_state(State& state) {
  const ValueUpdate update = take_value(state);
  state.painter.render();
  if (!update.changed) {
    return;
  }
  state.initialized = true;

  const std::optional<double> numeric = conditions::condition_value(update.value);
  const float fraction =
      conditions::range_fraction(numeric.has_value() ? *numeric : 0.0, state.range);
  const bool along_x = horizontal(state);
  const std::int32_t span = along_x ? state.inner_width : state.inner_height;
  const float nearest = std::min(state.origin_fraction, fraction);
  const float farthest = std::max(state.origin_fraction, fraction);
  const auto offset = static_cast<std::int32_t>(static_cast<float>(span) * nearest + 0.5F);
  const auto length =
      static_cast<std::int32_t>(static_cast<float>(span) * farthest + 0.5F) - offset;
  if (!update.first_render && length == state.drawn_length && offset == state.drawn_offset) {
    return;
  }
  state.drawn_length = length;
  state.drawn_offset = offset;
  if (state.gradient) {
    paint_fill(state);
  }

  const bool from_axis_start = along_x != state.inverted;
  const std::int32_t leading = from_axis_start ? offset : span - offset - length;
  if (along_x) {
    lv_obj_set_pos(state.fill, state.origin_x + leading, state.origin_y);
    lv_obj_set_size(state.fill, length, state.inner_height);
  } else {
    lv_obj_set_pos(state.fill, state.origin_x, state.origin_y + leading);
    lv_obj_set_size(state.fill, state.inner_width, length);
  }
}

}
