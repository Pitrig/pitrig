#include "graph_plot.hpp"

#include <algorithm>

#include "application_configuration.hpp"

namespace pitrig::dashboard::graph_widget::plot {

std::int32_t line_reserve(const std::uint16_t line_width_px) {
  return (static_cast<std::int32_t>(line_width_px) + 1) / 2;
}

std::int32_t corner_reserve(const std::uint16_t radius_px,
                            const std::int32_t border_px) {
  const std::int32_t inner =
      std::max<std::int32_t>(static_cast<std::int32_t>(radius_px) - border_px, 0);
  return (inner * 2929 + 9999) / 10000;
}

float sample_y(const std::int32_t plot_height, const float fraction) {
  const float y = static_cast<float>(plot_height) * (1.0F - fraction);
  return std::clamp<float>(y, 0.0F, static_cast<float>(plot_height));
}

void clear_columns(const State& state, lv_layer_t& layer,
                   const std::int32_t from, const std::int32_t count) {
  if (count <= 0) {
    return;
  }
  lv_draw_rect_dsc_t descriptor;
  lv_draw_rect_dsc_init(&descriptor);
  descriptor.bg_color = lv_color_hex(state.background_rgb);
  descriptor.bg_opa = LV_OPA_COVER;
  const std::int32_t height = state.plot_height + 2 * state.line_inset;
  lv_area_t area{from, 0, from + count - 1, height - 1};
  lv_draw_rect(&layer, &descriptor, &area);
  if (area.x2 >= state.plot_width) {
    lv_area_t wrapped{area.x1 - state.plot_width, 0,
                      area.x2 - state.plot_width, height - 1};
    lv_draw_rect(&layer, &descriptor, &wrapped);
  }
}

void draw_segment(const State& state, lv_layer_t& layer,
                  const std::uint32_t rgb, const std::int32_t x0, const float y0,
                  const std::int32_t x1, const float y1) {
  lv_draw_line_dsc_t descriptor;
  lv_draw_line_dsc_init(&descriptor);
  descriptor.color = lv_color_hex(rgb);
  descriptor.width = state.line_width_px;
  descriptor.opa = LV_OPA_COVER;
  descriptor.p1 = {static_cast<lv_value_precise_t>(x0),
                   static_cast<lv_value_precise_t>(y0)};
  descriptor.p2 = {static_cast<lv_value_precise_t>(x1),
                   static_cast<lv_value_precise_t>(y1)};
  lv_draw_line(&layer, &descriptor);
  if (x1 >= state.plot_width) {
    descriptor.p1.x -= static_cast<lv_value_precise_t>(state.plot_width);
    descriptor.p2.x -= static_cast<lv_value_precise_t>(state.plot_width);
    lv_draw_line(&layer, &descriptor);
  }
}

}
