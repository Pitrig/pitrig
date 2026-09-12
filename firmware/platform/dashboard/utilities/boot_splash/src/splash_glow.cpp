#include "splash_glow.hpp"

#include <algorithm>
#include <cstdint>

#include "lvgl.h"

namespace pitrig::dashboard::boot_splash {
namespace {

constexpr std::uint32_t kFlowMs = 1'600;
constexpr std::uint32_t kBaseDark = 0x1E1636;
constexpr std::uint32_t kBaseLight = 0x6A34C8;
constexpr std::uint32_t kGlint = 0xEDE4FF;
constexpr std::int32_t kGlintWidthDeg = 42;
constexpr std::int32_t kCornerSteps = 6;
constexpr std::int32_t kSeamOverlapDeg = 3;
constexpr std::int32_t kSeamOverlapPx = 1;

[[nodiscard]] std::uint32_t mix(const std::uint32_t from, const std::uint32_t to,
                                const std::int32_t amount) {
  const std::int32_t weight = std::clamp<std::int32_t>(amount, 0, 255);
  std::uint32_t blended = 0;
  for (std::int32_t shift = 16; shift >= 0; shift -= 8) {
    const std::int32_t a = static_cast<std::int32_t>((from >> shift) & 0xFF);
    const std::int32_t b = static_cast<std::int32_t>((to >> shift) & 0xFF);
    blended |= static_cast<std::uint32_t>(a + (b - a) * weight / 255) << shift;
  }
  return blended;
}

}

lv_color_t Glow::hue_at(const std::int32_t travelled, const std::int32_t perimeter) const {
  const std::int32_t position = travelled * 360 / std::max<std::int32_t>(perimeter, 1);
  const std::int32_t offset = ((position - phase_deg_ + 540) % 360) - 180;
  const std::int32_t distance = offset < 0 ? -offset : offset;
  const std::uint32_t base = mix(kBaseLight, kBaseDark, distance * 255 / 180);
  const std::int32_t fall = distance >= kGlintWidthDeg ? 0 : 255 - distance * 255 / kGlintWidthDeg;
  return lv_color_hex(mix(base, kGlint, fall * fall / 255));
}

void Glow::paint(lv_layer_t* const layer) const {
  lv_area_t coords{};
  lv_obj_get_coords(geometry_.container, &coords);
  const std::int32_t origin_x = coords.x1 + geometry_.x;
  const std::int32_t origin_y = coords.y1 + geometry_.y;
  const std::int32_t width = geometry_.width;
  const std::int32_t height = geometry_.height;
  const std::int32_t thickness = geometry_.thickness;
  const std::int32_t step = geometry_.segment;
  const std::int32_t corner = geometry_.corner;
  const std::int32_t straight_x = width - 2 * corner;
  const std::int32_t straight_y = height - 2 * corner;
  const std::int32_t quarter = 314 * corner / 200;
  const std::int32_t perimeter = 2 * (straight_x + straight_y) + 4 * quarter;

  lv_draw_rect_dsc_t rect{};
  lv_draw_rect_dsc_init(&rect);
  rect.bg_opa = LV_OPA_COVER;
  lv_draw_arc_dsc_t arc{};
  lv_draw_arc_dsc_init(&arc);
  arc.opa = LV_OPA_COVER;
  arc.width = thickness;
  arc.radius = static_cast<std::uint16_t>(corner);

  std::int32_t travelled = 0;

  const auto side = [&](const bool horizontal, const bool forward, const std::int32_t fixed,
                        const std::int32_t span) {
    for (std::int32_t offset = 0; offset < span; offset += step) {
      const std::int32_t end = std::min(offset + step, span);
      const std::int32_t lead = offset == 0 ? kSeamOverlapPx : 0;
      const std::int32_t tail = end == span ? kSeamOverlapPx : 0;
      const std::int32_t near = corner + (forward ? offset - lead : span - end - tail);
      const std::int32_t far = corner + (forward ? end + tail : span - offset + lead) - 1;
      rect.bg_color = hue_at(travelled + offset, perimeter);
      const lv_area_t area = horizontal
                                 ? lv_area_t{origin_x + near, origin_y + fixed, origin_x + far,
                                             origin_y + fixed + thickness - 1}
                                 : lv_area_t{origin_x + fixed, origin_y + near,
                                             origin_x + fixed + thickness - 1, origin_y + far};
      lv_draw_rect(layer, &rect, &area);
    }
    travelled += span;
  };

  const auto bend = [&](const std::int32_t centre_x, const std::int32_t centre_y,
                        const std::int32_t start_deg) {
    arc.center = {origin_x + centre_x, origin_y + centre_y};
    for (std::int32_t index = 0; index < kCornerSteps; ++index) {
      const std::int32_t overlap = index == 0 ? 0 : kSeamOverlapDeg;
      arc.start_angle = start_deg + index * 90 / kCornerSteps - overlap;
      arc.end_angle = start_deg + (index + 1) * 90 / kCornerSteps;
      arc.color = hue_at(travelled + index * quarter / kCornerSteps, perimeter);
      lv_draw_arc(layer, &arc);
    }
    travelled += quarter;
  };

  bend(corner, corner, 180);
  side(true, true, 0, straight_x);
  bend(width - corner, corner, 270);
  side(false, true, width - thickness, straight_y);
  bend(width - corner, height - corner, 0);
  side(true, false, height - thickness, straight_x);
  bend(corner, height - corner, 90);
  side(false, false, 0, straight_y);
}

void Glow::draw_border(lv_event_t* const event) {
  auto* const glow = static_cast<Glow*>(lv_event_get_user_data(event));
  lv_layer_t* const layer = lv_event_get_layer(event);
  if (glow == nullptr || layer == nullptr || glow->geometry_.container == nullptr) {
    return;
  }
  glow->paint(layer);
}

void Glow::invalidate_border() const {
  if (geometry_.container == nullptr) {
    return;
  }
  lv_area_t coords{};
  lv_obj_get_coords(geometry_.container, &coords);
  const std::int32_t depth = std::max(geometry_.thickness, geometry_.corner);
  const std::int32_t x1 = coords.x1 + geometry_.x;
  const std::int32_t y1 = coords.y1 + geometry_.y;
  const std::int32_t x2 = x1 + geometry_.width - 1;
  const std::int32_t y2 = y1 + geometry_.height - 1;
  const lv_area_t sides[] = {{x1, y1, x2, y1 + depth - 1},
                             {x1, y2 - depth + 1, x2, y2},
                             {x1, y1, x1 + depth - 1, y2},
                             {x2 - depth + 1, y1, x2, y2}};
  for (const lv_area_t& side : sides) {
    (void)lv_obj_invalidate_area(geometry_.container, &side);
  }
}

void Glow::set_phase(void* const target, const std::int32_t value) {
  auto* const glow = static_cast<Glow*>(target);
  if (glow == nullptr) {
    return;
  }
  glow->phase_deg_ = value;
  glow->invalidate_border();
}

void Glow::attach(const Geometry& geometry) {
  geometry_ = geometry;
  phase_deg_ = 0;
  lv_obj_add_event_cb(geometry_.container, &draw_border, LV_EVENT_DRAW_MAIN_END, this);

  lv_anim_t anim;
  lv_anim_init(&anim);
  lv_anim_set_var(&anim, this);
  lv_anim_set_exec_cb(&anim, &set_phase);
  lv_anim_set_values(&anim, 0, 359);
  lv_anim_set_duration(&anim, kFlowMs);
  lv_anim_set_repeat_count(&anim, LV_ANIM_REPEAT_INFINITE);
  lv_anim_start(&anim);
}

void Glow::detach() {
  lv_anim_delete(this, &set_phase);
  if (geometry_.container != nullptr) {
    (void)lv_obj_remove_event_cb_with_user_data(geometry_.container, &draw_border, this);
  }
  geometry_ = {};
}

}
