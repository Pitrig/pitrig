#include "graph_widget.hpp"

#include <algorithm>

#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "widget_conditions.hpp"

namespace simcore::dashboard::graph_widget {
namespace {

constexpr char kTag[] = "graph_widget";


// Where a rule's value colour lands for this widget type.
void apply_line_color(void* const context, const std::uint32_t rgb) {
  lv_obj_set_style_line_color(static_cast<lv_obj_t*>(context), lv_color_hex(rgb),
                              LV_PART_MAIN);
}

}  // namespace

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
  if (layout.display == nullptr || configurations.size() != bindings.size()) {
    return false;
  }
  return build_all(bindings.size(), [&](State& state, const std::size_t index) {
    return bindings[index].read != nullptr &&
           bindings[index].read_context != nullptr &&
           build(state, layout, configurations[index], bindings[index], fonts);
  });
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

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const frame::ValueBinding& binding,
                          const fonts::Registry& fonts) {
  if (binding.read == nullptr || binding.read_context == nullptr) {
    return false;
  }
  return rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, binding, fonts);
  });
}

}  // namespace simcore::dashboard::graph_widget
