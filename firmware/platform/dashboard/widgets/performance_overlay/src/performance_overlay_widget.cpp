#include "performance_overlay_widget.hpp"

#include "simcore_features.hpp"
#if SIMCORE_DEBUG
#include <cstdint>
#include <cstdio>

#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "performance.hpp"
#include "transport.hpp"
#endif

namespace simcore::dashboard::performance_overlay_widget {
#if SIMCORE_DEBUG
namespace {

constexpr std::uint32_t kBackgroundColor = 0x0B0B0B;
constexpr std::uint32_t kTextColor = 0xE8E8E8;
constexpr std::uint32_t kUpdatePeriodMs = 1'000;
constexpr std::int32_t kPadding = 3;
}  // namespace

View::~View() { destroy(); }

void View::render() {
  const performance::PerformanceStats stats = performance::get_stats();
  const transport::Diagnostics transport_stats =
      transport_ != nullptr ? transport_->diagnostics()
                            : transport::Diagnostics{};
  const std::uint64_t bytes_per_second =
      transport_stats.received_bytes - previous_received_bytes_;
  const std::uint64_t reads_per_second =
      transport_stats.read_events - previous_read_events_;
  previous_received_bytes_ = transport_stats.received_bytes;
  previous_read_events_ = transport_stats.read_events;

  char text[512];
  std::snprintf(text, sizeof(text),
                "FPS %.0f\n"
                "CPU %.0f%% / %.0f%%\n"
                "Render %.1fms\n"
                "Flush %.1fms\n"
                "Sync %.1fms Max %.1fms\n"
                "Work %.1fms Idle %.1fms\n"
                "Heap %luK / %luK\n"
                "PSRAM %luK\n"
                "Uptime %llus\n"
                "Link %lluB/s %lluR/s\n"
                "Queue %luB\n"
                "Overflow %lu/%lu\n"
                "Gap %lums Handler %luus\n"
                "Stack L/T/C/F/P %lu/%lu/%lu/%lu/%luB",
                static_cast<double>(stats.fps), static_cast<double>(stats.cpu_core0),
                static_cast<double>(stats.cpu_core1),
                static_cast<double>(stats.render_time_us) / 1'000.0,
                static_cast<double>(stats.flush_time_us) / 1'000.0,
                static_cast<double>(stats.sync_time_us) / 1'000.0,
                static_cast<double>(stats.longest_frame_us) / 1'000.0,
                static_cast<double>(stats.longest_work_us) / 1'000.0,
                static_cast<double>(stats.longest_gap_us) / 1'000.0,
                static_cast<unsigned long>(stats.free_heap / 1'024),
                static_cast<unsigned long>(stats.largest_heap_block / 1'024),
                static_cast<unsigned long>(stats.free_psram / 1'024),
                static_cast<unsigned long long>(stats.uptime_ms / 1'000),
                static_cast<unsigned long long>(bytes_per_second),
                static_cast<unsigned long long>(reads_per_second),
                static_cast<unsigned long>(transport_stats.buffered_bytes),
                static_cast<unsigned long>(transport_stats.fifo_overflows),
                static_cast<unsigned long>(transport_stats.buffer_full_events),
                static_cast<unsigned long>(transport_stats.maximum_read_gap_ms),
                static_cast<unsigned long>(transport_stats.maximum_handler_time_us),
                static_cast<unsigned long>(stats.task_stacks.lvgl_free_bytes),
                static_cast<unsigned long>(stats.task_stacks.transport_free_bytes),
                static_cast<unsigned long>(
                    stats.task_stacks.configuration_free_bytes),
                static_cast<unsigned long>(
                    stats.task_stacks.asset_upload_free_bytes),
                static_cast<unsigned long>(stats.task_stacks.sampler_free_bytes));
  lv_label_set_text(label_, text);
}

void View::update(lv_timer_t* const timer) {
  auto* const view = static_cast<View*>(lv_timer_get_user_data(timer));
  if (view != nullptr) {
    view->render();
  }
}

bool View::create(lv_display_t* const display,
                  const transport::ITransport& transport) {
  if (display == nullptr || label_ != nullptr || !lvgl_port_lock(0)) {
    return false;
  }
  transport_ = &transport;
  label_ = lv_label_create(lv_display_get_layer_top(display));
  lv_obj_remove_style_all(label_);
  lv_obj_set_style_bg_color(label_, lv_color_hex(kBackgroundColor), LV_PART_MAIN);
  // Translucent so the dashboard underneath stays readable. The cost is that
  // the widgets it covers are blended into it whenever the overlay refreshes,
  // which is one slower frame per second and shows up in the longest-frame
  // measurement; that is worth less than hiding the widgets being diagnosed.
  lv_obj_set_style_bg_opa(label_, LV_OPA_70, LV_PART_MAIN);
  lv_obj_set_style_pad_all(label_, kPadding, LV_PART_MAIN);
  lv_obj_set_style_text_color(label_, lv_color_hex(kTextColor), LV_PART_MAIN);
  lv_obj_set_style_text_font(label_, LV_FONT_DEFAULT, LV_PART_MAIN);
  lv_obj_set_style_text_line_space(label_, 0, LV_PART_MAIN);
  lv_obj_align(label_, LV_ALIGN_TOP_RIGHT, -kPadding, kPadding);

  render();
  timer_ = lv_timer_create(update, kUpdatePeriodMs, this);
  if (timer_ == nullptr) {
    lv_obj_delete(label_);
    label_ = nullptr;
    transport_ = nullptr;
    lvgl_port_unlock();
    return false;
  }
  lvgl_port_unlock();
  return true;
}

void View::destroy() {
  if (label_ == nullptr || !lvgl_port_lock(0)) {
    return;
  }
  if (timer_ != nullptr) {
    lv_timer_delete(timer_);
    timer_ = nullptr;
  }
  lv_obj_delete(label_);
  label_ = nullptr;
  transport_ = nullptr;
  previous_received_bytes_ = 0;
  previous_read_events_ = 0;
  lvgl_port_unlock();
}
#else
View::~View() = default;
bool View::create(lv_display_t*, const transport::ITransport&) { return true; }
void View::destroy() {}
void View::update(lv_timer_t*) {}
void View::render() {}
#endif

}  // namespace simcore::dashboard::performance_overlay_widget
