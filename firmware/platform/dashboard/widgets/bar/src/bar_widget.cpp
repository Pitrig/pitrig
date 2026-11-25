#include "bar_widget.hpp"

#include <algorithm>

#include "bar_fill.hpp"
#include "lvgl.h"
#include "value_conditions.hpp"
#include "widget_inner_box.hpp"

namespace pitrig::dashboard::bar_widget {
namespace {

constexpr char kTag[] = "bar_widget";

[[nodiscard]] bool horizontal(const State& state) {
  return state.orientation == configuration::BarOrientation::horizontal;
}

void apply_fill_color(void* const context, const std::uint32_t rgb) {
  auto& state = *static_cast<State*>(context);
  if (state.ramp.from == rgb) {
    return;
  }
  state.ramp.from = rgb;
  draw::set_stops(state);
  draw::invalidate_fill(state);
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
  state.radius = frame::fill_radius(config.frame, border);
  state.anchored = state.gradient && state.radius == 0;
  state.fill = lv_obj_create(box.container);
  if (state.fill == nullptr) {
    return false;
  }
  lv_obj_remove_style_all(state.fill);
  lv_obj_remove_flag(state.fill, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(state.fill, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_pos(state.fill, state.origin_x, state.origin_y);
  lv_obj_set_size(state.fill, state.inner_width, state.inner_height);
  if (state.gradient) {
    state.grad = {};
    state.grad.dir = horizontal(state) ? LV_GRAD_DIR_HOR : LV_GRAD_DIR_VER;
    state.grad.extend = LV_GRAD_EXTEND_PAD;
  }
  state.drawn_length = -1;
  state.drawn_offset = -1;
  draw::set_stops(state);
  draw::attach(state);

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
  const std::int32_t span = horizontal(state) ? state.inner_width : state.inner_height;
  const float nearest = std::min(state.origin_fraction, fraction);
  const float farthest = std::max(state.origin_fraction, fraction);
  const auto offset = static_cast<std::int32_t>(static_cast<float>(span) * nearest + 0.5F);
  const auto length =
      static_cast<std::int32_t>(static_cast<float>(span) * farthest + 0.5F) - offset;
  if (!update.first_render && length == state.drawn_length && offset == state.drawn_offset) {
    return;
  }
  const std::int32_t old_offset = state.drawn_offset;
  const std::int32_t old_length = state.drawn_length;
  state.drawn_length = length;
  state.drawn_offset = offset;
  if (!state.anchored) {
    draw::set_stops(state);
  }
  if (update.first_render || old_length < 0) {
    draw::invalidate_fill(state);
    return;
  }
  draw::invalidate_moved(state, old_offset, old_length);
}

}
