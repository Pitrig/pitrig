#include "graph_widget.hpp"

#include <algorithm>

#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "widget_conditions.hpp"

namespace simcore::dashboard::graph_widget {
namespace {

constexpr char kTag[] = "graph_widget";

// Telemetry changes wake the render timer early through the dashboard's render
// trigger, so this is the fallback poll and the sampling cadence.
constexpr std::uint32_t kRenderPeriodMs = LV_DEF_REFR_PERIOD;

// Where a rule's value colour lands for this widget type.
void apply_line_color(void* const context, const std::uint32_t rgb) {
  lv_obj_set_style_line_color(static_cast<lv_obj_t*>(context), lv_color_hex(rgb),
                              LV_PART_MAIN);
}

}  // namespace

Collection::~Collection() { destroy(); }

void Collection::destroy() {
  if (!created_ || !lvgl_port_lock(0)) {
    return;
  }
  clear_objects();
  lvgl_port_unlock();
}

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const frame::ValueBinding& binding,
                       const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  // A graph has no intrinsic size: the placement is the whole of it.
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.read = binding.read;
  state.read_context = binding.read_context;
  state.range = config.range;
  state.free_running = binding.fast_updates;
  state.point_count = std::min<std::size_t>(config.point_count, kMaximumPoints);
  state.sample_interval_ms = config.sample_interval_ms;
  state.filled = 0;
  state.last_sample_tick = lv_tick_get();

  const std::int32_t border = config.frame.border.width_px;
  state.plot_width = std::max<std::int32_t>(
      bounds.width - 2 * border - config.frame.padding.left -
          config.frame.padding.right,
      0);
  state.plot_height = std::max<std::int32_t>(
      bounds.height - 2 * border - config.frame.padding.top -
          config.frame.padding.bottom,
      0);

  state.line = lv_line_create(box.container);
  lv_obj_remove_style_all(state.line);
  lv_obj_set_pos(state.line, 0, 0);
  lv_obj_set_size(state.line, state.plot_width, state.plot_height);
  lv_obj_remove_flag(state.line, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(state.line, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_style_line_color(state.line, lv_color_hex(config.line_color),
                              LV_PART_MAIN);
  lv_obj_set_style_line_width(state.line, config.line_width_px, LV_PART_MAIN);
  lv_obj_set_style_line_opa(state.line, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_line_rounded(state.line, true, LV_PART_MAIN);
  // The widget owns the point array for the whole of its life, so LVGL reads it
  // in place instead of copying it on every sample.
  lv_line_set_points_mutable(state.line, state.points.data(), 0);

  state.painter.configure(config.frame, box, config.line_color,
                          &apply_line_color, state.line);
  state.painter.bind(binding.condition_read, binding.condition_context);
  return true;
}

bool Collection::create(const Layout& layout,
                        const std::span<const Config> configurations,
                        const std::span<const frame::ValueBinding> bindings,
                        const fonts::Registry& fonts) {
  if (layout.display == nullptr || bindings.size() > states_.size() ||
      configurations.size() != bindings.size() || created_ ||
      !lvgl_port_lock(0)) {
    return false;
  }

  created_ = true;
  for (std::size_t widget = 0; widget < bindings.size(); ++widget) {
    if (bindings[widget].read == nullptr ||
        bindings[widget].read_context == nullptr ||
        !build(states_[count_], layout, configurations[widget],
               bindings[widget], fonts)) {
      clear_objects();
      created_ = false;
      lvgl_port_unlock();
      return false;
    }
    ++count_;
  }

  render();
  if (count_ > 0) {
    timer_ = lv_timer_create(update, kRenderPeriodMs, this);
    if (timer_ == nullptr) {
      clear_objects();
      created_ = false;
      lvgl_port_unlock();
      return false;
    }
  }

  lvgl_port_unlock();
  return true;
}

void Collection::update(lv_timer_t* const timer) {
  auto* const collection =
      static_cast<Collection*>(lv_timer_get_user_data(timer));
  if (collection != nullptr) {
    collection->render();
  }
}

void Collection::wake() {
  if (timer_ != nullptr) {
    lv_timer_ready(timer_);
  }
}

void Collection::render_state(State& state) {
  state.painter.render();
  // The trace advances on its own clock rather than on telemetry arrival, so
  // the horizontal axis stays time and a stalled source draws a flat line
  // instead of freezing the plot.
  const std::uint32_t now = lv_tick_get();
  const bool due = !state.initialized ||
                   now - state.last_sample_tick >= state.sample_interval_ms;
  if (!due) {
    return;
  }
  state.last_sample_tick = now;
  state.initialized = true;

  const telemetry::TelemetryRead value = state.read(state.read_context);
  const std::optional<double> numeric = conditions::condition_value(value);
  const float fraction =
      numeric.has_value() ? conditions::range_fraction(*numeric, state.range)
                          : 0.0F;

  // The newest sample lands at the right, so once the history is full the whole
  // trace shifts left by one.
  if (state.filled < state.point_count) {
    state.samples[state.filled] = fraction;
    ++state.filled;
  } else {
    std::copy(state.samples.begin() + 1,
              state.samples.begin() +
                  static_cast<std::ptrdiff_t>(state.point_count),
              state.samples.begin());
    state.samples[state.point_count - 1] = fraction;
  }

  if (state.filled < 2 || state.point_count < 2) {
    return;
  }
  const auto span = static_cast<std::int32_t>(state.point_count - 1);
  for (std::size_t index = 0; index < state.filled; ++index) {
    const std::int32_t x =
        state.plot_width * static_cast<std::int32_t>(index) / span;
    const auto y = static_cast<std::int32_t>(
        static_cast<float>(state.plot_height) * (1.0F - state.samples[index]) +
        0.5F);
    state.points[index].x = x;
    state.points[index].y = std::clamp<std::int32_t>(y, 0, state.plot_height);
  }
  lv_line_set_points_mutable(state.line, state.points.data(),
                             static_cast<std::uint32_t>(state.filled));
}

void Collection::render() {
  if (!created_) {
    return;
  }
  for (std::size_t index = 0; index < count_; ++index) {
    render_state(states_[index]);
  }
}

void Collection::release(State& state) {
  state.painter.release();
  if (state.container != nullptr) {
    lv_obj_delete(state.container);
  }
  state = {};
}

void Collection::clear_objects() {
  if (timer_ != nullptr) {
    lv_timer_delete(timer_);
    timer_ = nullptr;
  }
  for (std::size_t index = 0; index < count_; ++index) {
    release(states_[index]);
  }
  count_ = 0;
  created_ = false;
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const frame::ValueBinding& binding,
                          const fonts::Registry& fonts) {
  if (!created_ || index >= count_ || binding.read == nullptr ||
      binding.read_context == nullptr || !lvgl_port_lock(0)) {
    return false;
  }
  State& state = states_[index];
  release(state);
  const bool built = build(state, layout, configuration, binding, fonts);
  if (built) {
    render_state(state);
  } else {
    release(state);
  }
  lvgl_port_unlock();
  return built;
}

}  // namespace simcore::dashboard::graph_widget
