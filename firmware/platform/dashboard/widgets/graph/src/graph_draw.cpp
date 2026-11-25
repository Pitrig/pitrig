#include "graph_draw.hpp"

#include "graph_raster.hpp"
#include "lvgl_private.h"

namespace pitrig::dashboard::graph_widget::draw {
namespace {

void finish_pending(const lv_layer_t& layer) {
  lv_draw_dispatch_request();
  while (layer.draw_task_head != nullptr) {
    lv_draw_dispatch_wait_for_request();
    lv_draw_dispatch();
  }
}

void fill_plain(lv_layer_t& layer, const State& state, lv_obj_t* const plot, const lv_opa_t opa) {
  lv_draw_fill_dsc_t descriptor;
  lv_draw_fill_dsc_init(&descriptor);
  descriptor.color = lv_color_hex(state.background_rgb);
  descriptor.opa = opa;
  descriptor.base.obj = plot;
  descriptor.base.part = LV_PART_MAIN;
  lv_draw_fill(&layer, &descriptor, &plot->coords);
}

void on_draw(lv_event_t* const event) {
  auto* const plot = static_cast<lv_obj_t*>(lv_event_get_current_target(event));
  lv_layer_t& layer = *lv_event_get_layer(event);
  if (layer.opa <= LV_OPA_MIN) {
    return;
  }
  const auto& state = *static_cast<const State*>(lv_event_get_user_data(event));
  lv_area_t area;
  if (!lv_area_intersect(&area, &layer._clip_area, &plot->coords)) {
    return;
  }
  if (!raster::supports(layer.color_format)) {
    fill_plain(layer, state, plot, layer.opa);
    return;
  }
  finish_pending(layer);
  if (lv_draw_layer_alloc_buf(&layer) == nullptr ||
      !lv_area_intersect(&area, &area, &layer.buf_area)) {
    return;
  }
  const raster::Surface surface{static_cast<std::uint8_t*>(lv_draw_layer_go_to_xy(&layer, 0, 0)),
                                static_cast<std::int32_t>(layer.draw_buf->header.stride),
                                plot->coords.x1 - layer.buf_area.x1,
                                plot->coords.y1 - layer.buf_area.y1,
                                layer.color_format,
                                layer.opa};
  const raster::Region region{area.x1 - plot->coords.x1, area.y1 - plot->coords.y1,
                              area.x2 - plot->coords.x1, area.y2 - plot->coords.y1};
  raster::paint(state, surface, region);
}

void on_cover_check(lv_event_t* const event) {
  auto* const info = static_cast<lv_cover_check_info_t*>(lv_event_get_param(event));
  auto* const plot = static_cast<lv_obj_t*>(lv_event_get_current_target(event));
  if (info->res == LV_COVER_RES_MASKED ||
      lv_obj_get_style_opa_recursive(plot, LV_PART_MAIN) < LV_OPA_MAX) {
    return;
  }
  info->res =
      lv_area_is_in(info->area, &plot->coords, 0) ? LV_COVER_RES_COVER : LV_COVER_RES_NOT_COVER;
}

}

void attach(lv_obj_t* const plot, State& state) {
  lv_obj_add_event_cb(plot, on_draw, LV_EVENT_DRAW_MAIN, &state);
  lv_obj_add_event_cb(plot, on_cover_check, LV_EVENT_COVER_CHECK, nullptr);
}

}
