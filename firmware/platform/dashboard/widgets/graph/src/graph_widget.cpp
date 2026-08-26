#include "graph_widget.hpp"

#include <algorithm>

#include "esp_lvgl_port.h"
#include "graph_binding.hpp"
#include "logger.hpp"
#include "lvgl.h"
#include "widget_conditions.hpp"

namespace simcore::dashboard::graph_widget {
namespace {

constexpr char kTag[] = "graph_widget";

[[nodiscard]] std::int32_t line_reserve(const std::uint16_t line_width_px) {
  return (static_cast<std::int32_t>(line_width_px) + 1) / 2;
}

[[nodiscard]] std::int32_t corner_reserve(const std::uint16_t radius_px,
                                          const std::int32_t border_px) {
  const std::int32_t inner =
      std::max<std::int32_t>(static_cast<std::int32_t>(radius_px) - border_px, 0);
  return (inner * 2929 + 9999) / 10000;
}

[[nodiscard]] std::int32_t sample_y(const std::int32_t plot_height,
                                    const float fraction) {
  const auto y = static_cast<std::int32_t>(
      static_cast<float>(plot_height) * (1.0F - fraction) + 0.5F);
  return std::clamp<std::int32_t>(y, 0, plot_height);
}

void apply_line_color(void* const context, const std::uint32_t rgb) {
  auto& state = *static_cast<State*>(context);
  for (std::size_t index = 0; index < state.trace_count; ++index) {
    const Trace& trace = state.traces[index];
    if (trace.line == nullptr) {
      continue;
    }
    lv_obj_set_style_line_color(
        trace.line,
        lv_color_hex(rgb == configuration::kTransparentColor ? trace.color
                                                             : rgb),
        LV_PART_MAIN);
  }
}

[[nodiscard]] configuration::ValueRange trace_range(const Config& config,
                                                    const std::size_t index) {
  return index == 0 ? config.range : config.traces[index - 1].range;
}

[[nodiscard]] std::uint32_t trace_color(const Config& config,
                                        const std::size_t index) {
  return index == 0 ? config.line_color : config.traces[index - 1].line_color;
}

}

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const WidgetBinding& binding,
                       const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.trace_count = std::min(binding.count, config.trace_count + std::size_t{1});
  state.point_count = std::min<std::size_t>(config.point_count, kMaximumPoints);
  state.sample_interval_ms = config.sample_interval_ms;
  state.filled = 0;
  state.last_sample_tick = lv_tick_get();

  const std::int32_t border = config.frame.border.width_px;
  const std::int32_t reserve =
      line_reserve(config.line_width_px) +
      corner_reserve(config.frame.border.radius_px, border);
  const std::int32_t plot_width = std::max<std::int32_t>(
      bounds.width - 2 * border - config.frame.padding.left -
          config.frame.padding.right - 2 * reserve,
      0);
  state.plot_height = std::max<std::int32_t>(
      bounds.height - 2 * border - config.frame.padding.top -
          config.frame.padding.bottom - 2 * reserve,
      0);

  const auto span = static_cast<std::int32_t>(
      state.point_count > 1 ? state.point_count - 1 : 1);
  for (std::size_t index = 0; index < state.trace_count; ++index) {
    Trace& trace = state.traces[index];
    trace.read = binding.sources[index].read;
    trace.read_context = binding.sources[index].read_context;
    trace.range = trace_range(config, index);
    trace.color = trace_color(config, index);

    trace.line = lv_line_create(box.container);
    if (trace.line == nullptr) {
      log::error(kTag, "Failed to create graph trace %u",
                 static_cast<unsigned>(index));
      return false;
    }
    lv_obj_remove_style_all(trace.line);
    lv_obj_set_pos(trace.line, reserve, reserve);
    lv_obj_set_size(trace.line, plot_width, state.plot_height);
    lv_obj_remove_flag(trace.line, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(trace.line, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_line_color(trace.line, lv_color_hex(trace.color),
                                LV_PART_MAIN);
    lv_obj_set_style_line_width(trace.line, config.line_width_px, LV_PART_MAIN);
    lv_obj_set_style_line_opa(trace.line, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_line_rounded(trace.line, true, LV_PART_MAIN);
    for (std::size_t point = 0; point < state.point_count; ++point) {
      trace.points[point].x =
          plot_width * static_cast<std::int32_t>(point) / span;
    }
    lv_line_set_points_mutable(trace.line, trace.points.data(), 0);
  }

  state.painter.configure(config.frame, box, configuration::kTransparentColor,
                          &apply_line_color, &state);
  state.painter.bind(binding.condition.read, binding.condition.read_context);
  return true;
}

bool Collection::create(const Layout& layout,
                        const std::span<const Config> configurations,
                        const std::span<const WidgetBinding> bindings,
                        const fonts::Registry& fonts) {
  if (layout.display == nullptr || configurations.size() != bindings.size()) {
    return false;
  }
  return build_all(bindings.size(), [&](State& state, const std::size_t index) {
    return bindings[index].count > 0 &&
           build(state, layout, configurations[index], bindings[index], fonts);
  });
}

void Collection::render_state(State& state) {
  state.painter.render();
  const std::uint32_t now = lv_tick_get();
  const bool due = !state.initialized ||
                   now - state.last_sample_tick >= state.sample_interval_ms;
  if (!due || state.point_count < 2) {
    return;
  }
  state.last_sample_tick = now;
  state.initialized = true;

  const bool full = state.filled == state.point_count;
  if (!full) {
    ++state.filled;
  }
  const std::size_t newest = state.filled - 1;

  for (std::size_t index = 0; index < state.trace_count; ++index) {
    Trace& trace = state.traces[index];
    const telemetry::TelemetryRead value = trace.read(trace.read_context);
    const std::optional<double> numeric = conditions::condition_value(value);
    const float fraction =
        numeric.has_value() ? conditions::range_fraction(*numeric, trace.range)
                            : 0.0F;
    if (full) {
      for (std::size_t point = 1; point < state.point_count; ++point) {
        trace.points[point - 1].y = trace.points[point].y;
      }
    }
    trace.points[newest].y = sample_y(state.plot_height, fraction);
    if (state.filled >= 2) {
      lv_line_set_points_mutable(trace.line, trace.points.data(),
                                 static_cast<std::uint32_t>(state.filled));
    }
  }
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration,
                          const WidgetBinding& binding,
                          const fonts::Registry& fonts) {
  if (binding.count == 0) {
    return false;
  }
  return rebuild_one(index, [&](State& state) {
    return build(state, layout, configuration, binding, fonts);
  });
}

}
