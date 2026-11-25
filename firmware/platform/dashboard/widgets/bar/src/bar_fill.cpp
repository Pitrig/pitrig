#include "bar_fill.hpp"

#include <algorithm>

#include "fill_ramp.hpp"
#include "lvgl_private.h"

namespace pitrig::dashboard::bar_widget::draw {
namespace {

constexpr std::int32_t kCornerMargin = 1;

static_assert(LV_GRADIENT_MAX_STOPS >= 3);

[[nodiscard]] bool horizontal(const State& state) {
  return state.orientation == configuration::BarOrientation::horizontal;
}

[[nodiscard]] std::int32_t span_of(const State& state) {
  return horizontal(state) ? state.inner_width : state.inner_height;
}

[[nodiscard]] lv_area_t area_of(const State& state, const std::int32_t offset,
                                const std::int32_t length) {
  lv_area_t area;
  lv_obj_get_coords(state.fill, &area);
  const bool along_x = horizontal(state);
  const bool from_axis_start = along_x != state.inverted;
  const std::int32_t leading = from_axis_start ? offset : span_of(state) - offset - length;
  if (along_x) {
    area.x1 += leading;
    area.x2 = area.x1 + length - 1;
  } else {
    area.y1 += leading;
    area.y2 = area.y1 + length - 1;
  }
  return area;
}

void invalidate(const State& state, const lv_area_t& area) {
  if (area.x2 < area.x1 || area.y2 < area.y1) {
    return;
  }
  lv_area_t shown = area;
  lv_obj_invalidate_area(state.fill, &shown);
}

void add_stop(lv_grad_dsc_t& grad, const std::uint32_t rgb, const float fraction) {
  grad.stops[grad.stops_count++] = {.color = lv_color_hex(rgb),
                                    .opa = LV_OPA_COVER,
                                    .frac = static_cast<std::uint8_t>(fraction * 255.0F + 0.5F)};
}

void on_draw(lv_event_t* const event) {
  const auto& state = *static_cast<const State*>(lv_event_get_user_data(event));
  const lv_opa_t opa = lv_obj_get_style_opa_recursive(state.fill, LV_PART_MAIN);
  if (state.drawn_length <= 0 || opa <= LV_OPA_MIN) {
    return;
  }
  lv_layer_t& layer = *lv_event_get_layer(event);
  const lv_area_t area = area_of(state, state.drawn_offset, state.drawn_length);
  lv_draw_rect_dsc_t descriptor;
  lv_draw_rect_dsc_init(&descriptor);
  descriptor.base.obj = state.fill;
  descriptor.base.part = LV_PART_MAIN;
  descriptor.bg_opa = opa;
  descriptor.radius = state.radius;
  descriptor.bg_color = lv_color_hex(state.ramp.from);
  if (state.gradient) {
    descriptor.bg_grad = state.grad;
  }
  if (!state.anchored) {
    lv_draw_rect(&layer, &descriptor, &area);
    return;
  }
  const lv_area_t clip = layer._clip_area;
  lv_area_t shown;
  if (!lv_area_intersect(&shown, &clip, &area)) {
    return;
  }
  lv_area_t track;
  lv_obj_get_coords(state.fill, &track);
  layer._clip_area = shown;
  lv_draw_rect(&layer, &descriptor, &track);
  layer._clip_area = clip;
}

void on_cover_check(lv_event_t* const event) {
  auto* const info = static_cast<lv_cover_check_info_t*>(lv_event_get_param(event));
  const auto& state = *static_cast<const State*>(lv_event_get_user_data(event));
  if (info->res == LV_COVER_RES_MASKED || state.drawn_length <= 0 ||
      lv_obj_get_style_opa_recursive(state.fill, LV_PART_MAIN) < LV_OPA_MAX) {
    return;
  }
  const lv_area_t area = area_of(state, state.drawn_offset, state.drawn_length);
  if (lv_area_is_in(info->area, &area, state.radius)) {
    info->res = LV_COVER_RES_COVER;
  }
}

}

void attach(State& state) {
  lv_obj_add_event_cb(state.fill, on_draw, LV_EVENT_DRAW_MAIN, &state);
  lv_obj_add_event_cb(state.fill, on_cover_check, LV_EVENT_COVER_CHECK, &state);
}

void set_stops(State& state) {
  if (!state.gradient) {
    return;
  }
  const std::int32_t span = span_of(state);
  const auto last = static_cast<float>(std::max<std::int32_t>(span - 1, 1));
  float near_px = 0.0F;
  float far_px = last;
  if (!state.anchored) {
    near_px = static_cast<float>(std::clamp<std::int32_t>(state.drawn_offset, 0, span - 1));
    far_px = std::clamp(static_cast<float>(state.drawn_offset + state.drawn_length - 1), near_px,
                        last);
  }
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
}

void invalidate_fill(const State& state) {
  invalidate(state, area_of(state, state.drawn_offset, state.drawn_length));
}

void invalidate_moved(const State& state, const std::int32_t old_offset,
                      const std::int32_t old_length) {
  const lv_area_t before = area_of(state, old_offset, old_length);
  const lv_area_t after = area_of(state, state.drawn_offset, state.drawn_length);
  const bool along_x = horizontal(state);
  const std::int32_t thickness = along_x ? lv_area_get_height(&after) : lv_area_get_width(&after);
  const std::int32_t corner =
      state.radius > 0 ? std::min(state.radius, thickness / 2) + kCornerMargin : 0;
  if ((state.gradient && !state.anchored) || old_length <= 2 * corner ||
      state.drawn_length <= 2 * corner) {
    invalidate(state, before);
    invalidate(state, after);
    return;
  }
  const std::int32_t start_before = along_x ? before.x1 : before.y1;
  const std::int32_t start_after = along_x ? after.x1 : after.y1;
  const std::int32_t end_before = along_x ? before.x2 : before.y2;
  const std::int32_t end_after = along_x ? after.x2 : after.y2;
  lv_area_t changed = after;
  std::int32_t& first = along_x ? changed.x1 : changed.y1;
  std::int32_t& last = along_x ? changed.x2 : changed.y2;
  if (start_before != start_after) {
    first = std::min(start_before, start_after);
    last = std::max(start_before, start_after) + corner;
    invalidate(state, changed);
  }
  if (end_before != end_after) {
    first = std::min(end_before, end_after) - corner;
    last = std::max(end_before, end_after);
    invalidate(state, changed);
  }
}

}
