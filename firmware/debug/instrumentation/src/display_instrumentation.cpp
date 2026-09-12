#include "display_instrumentation.hpp"

#include <cstdint>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"
#include "performance.hpp"

namespace pitrig::display::instrumentation {
namespace {

struct Observation {
  bool frame_rendered{};
};

Observation observation;

[[nodiscard]] Observation* observation_of(lv_event_t* const event) {
  return static_cast<Observation*>(lv_event_get_user_data(event));
}

void on_refresh_started(lv_event_t* const event) {
  observation_of(event)->frame_rendered = false;
  performance::frame_started();
}

void on_render_started(lv_event_t* const event) {
  observation_of(event)->frame_rendered = true;
  performance::render_started();
}

void on_render_finished(lv_event_t*) { performance::render_finished(); }

void on_refresh_finished(lv_event_t* const event) {
  if (observation_of(event)->frame_rendered) {
    performance::frame_finished();
  }
}

void on_area_invalidated(lv_event_t* const event) {
  const auto* const area = static_cast<const lv_area_t*>(lv_event_get_param(event));
  if (area != nullptr) {
    performance::area_invalidated(static_cast<std::uint32_t>(lv_area_get_width(area)) *
                                  static_cast<std::uint32_t>(lv_area_get_height(area)));
  }
}

void on_flush_started(lv_event_t*) { performance::flush_started(); }

void on_flush_finished(lv_event_t*) { performance::flush_finished(); }

void on_flush_wait_started(lv_event_t*) { performance::flush_wait_started(); }

void on_flush_wait_finished(lv_event_t*) { performance::flush_wait_finished(); }

}

void observe(lv_display_t* const display) {
  if (display == nullptr) {
    return;
  }
  performance::register_task(performance::TaskMetric::lvgl, xTaskGetHandle("taskLVGL"));
  lv_display_add_event_cb(display, on_refresh_started, LV_EVENT_REFR_START, &observation);
  lv_display_add_event_cb(display, on_render_started, LV_EVENT_RENDER_START, &observation);
  lv_display_add_event_cb(display, on_render_finished, LV_EVENT_RENDER_READY, &observation);
  lv_display_add_event_cb(display, on_refresh_finished, LV_EVENT_REFR_READY, &observation);
  lv_display_add_event_cb(display, on_area_invalidated, LV_EVENT_INVALIDATE_AREA, &observation);
  lv_display_add_event_cb(display, on_flush_started, LV_EVENT_FLUSH_START, &observation);
  lv_display_add_event_cb(display, on_flush_finished, LV_EVENT_FLUSH_FINISH, &observation);
  lv_display_add_event_cb(display, on_flush_wait_started, LV_EVENT_FLUSH_WAIT_START, &observation);
  lv_display_add_event_cb(display, on_flush_wait_finished, LV_EVENT_FLUSH_WAIT_FINISH,
                          &observation);
}

}
