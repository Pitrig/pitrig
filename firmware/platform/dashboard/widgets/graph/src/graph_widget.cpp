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

// Half a line width, rounded up. LVGL centres a stroke on its path and clips a
// child at the container's own box — the frame line included — so a trace
// allowed to reach the edge of the content area would draw half its width over
// the border and lose the other half. Keeping this much clear on every side is
// what makes a value at either end of its window visible whole, round cap and
// all.
[[nodiscard]] std::int32_t line_reserve(const std::uint16_t line_width_px) {
  return (static_cast<std::int32_t>(line_width_px) + 1) / 2;
}

// How far a rounded frame takes the plot's corners in beyond what the border
// width already did. The content area LVGL positions children in is a plain
// rectangle, so with a radius its corners sit outside the arc the frame line
// follows — which is where a trace at the far left of its window, at the top or
// the bottom of its range, was drawing over the curve.
//
// A corner of a box inset by `d` clears an arc of radius `r` when
// 2*(r - d)^2 <= r^2, so d >= r*(1 - 1/sqrt(2)). 2929/10000 is that constant to
// four places and rounds up, which is the direction that cannot let a pixel
// out; integer throughout because this is composition-time geometry and the
// rest of the frame's arithmetic is too.
[[nodiscard]] std::int32_t corner_reserve(const std::uint16_t radius_px,
                                          const std::int32_t border_px) {
  // The line follows the inner edge of the border, whose radius is what the
  // frame's own radius leaves after the width is drawn inward.
  const std::int32_t inner =
      std::max<std::int32_t>(static_cast<std::int32_t>(radius_px) - border_px, 0);
  return (inner * 2929 + 9999) / 10000;
}

// Where one sample sits in the plot. The fraction is already clamped, and the
// pixel is clamped again because rounding at the top of the window would
// otherwise land one pixel outside the box the reserve just cleared.
[[nodiscard]] std::int32_t sample_y(const std::int32_t plot_height,
                                    const float fraction) {
  const auto y = static_cast<std::int32_t>(
      static_cast<float>(plot_height) * (1.0F - fraction) + 0.5F);
  return std::clamp<std::int32_t>(y, 0, plot_height);
}

// Where a rule's value colour lands for this widget type. A graph may draw
// three traces, so a rule paints all of them at once — the widget is in alarm,
// not one of its lines. The fallback the painter restores is the transparent
// sentinel, which no rule and no ramp can produce, and restoring means handing
// each trace its own authored colour back.
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

// The window and the colour of one trace, by the order the widget draws them:
// the widget's own source is the first, and `traces` supplies the rest.
[[nodiscard]] configuration::ValueRange trace_range(const Config& config,
                                                    const std::size_t index) {
  return index == 0 ? config.range : config.traces[index - 1].range;
}

[[nodiscard]] std::uint32_t trace_color(const Config& config,
                                        const std::size_t index) {
  return index == 0 ? config.line_color : config.traces[index - 1].line_color;
}

}  // namespace

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const WidgetBinding& binding,
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
  // Bounded by the document as well as by the binding: trace_range and
  // trace_color index the traces array directly, so what keeps that in range is
  // the count the array itself carries rather than the binder agreeing with it.
  state.trace_count = std::min(binding.count, config.trace_count + std::size_t{1});
  state.point_count = std::min<std::size_t>(config.point_count, kMaximumPoints);
  state.sample_interval_ms = config.sample_interval_ms;
  state.filled = 0;
  state.last_sample_tick = lv_tick_get();

  const std::int32_t border = config.frame.border.width_px;
  // Both allowances are taken on every side: the stroke is centred on the path,
  // and the corners have to clear the curve. The padding is not counted against
  // the corner allowance — it would make one rule into four, for at most a
  // third of a radius of plot.
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
    // LVGL places a child against the parent's content area, which the border
    // and the padding have already inset, so this offset is the reserve alone.
    lv_obj_set_pos(trace.line, reserve, reserve);
    lv_obj_set_size(trace.line, plot_width, state.plot_height);
    lv_obj_remove_flag(trace.line, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(trace.line, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_line_color(trace.line, lv_color_hex(trace.color),
                                LV_PART_MAIN);
    lv_obj_set_style_line_width(trace.line, config.line_width_px, LV_PART_MAIN);
    lv_obj_set_style_line_opa(trace.line, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_line_rounded(trace.line, true, LV_PART_MAIN);
    // The horizontal axis is time, and time is the same for every trace, so
    // each x is written once here and a sample never touches one again.
    for (std::size_t point = 0; point < state.point_count; ++point) {
      trace.points[point].x =
          plot_width * static_cast<std::int32_t>(point) / span;
    }
    // The widget owns the point array for the whole of its life, so LVGL reads
    // it in place instead of copying it on every sample.
    lv_line_set_points_mutable(trace.line, trace.points.data(), 0);
  }

  // The transparent sentinel rather than a colour: with several traces there is
  // no single authored colour to fall back to, and apply_line_color reads it as
  // "give each trace its own back".
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
  // The traces advance on their own clock rather than on telemetry arrival, so
  // the horizontal axis stays time and a stalled source draws a flat line
  // instead of freezing the plot.
  const std::uint32_t now = lv_tick_get();
  const bool due = !state.initialized ||
                   now - state.last_sample_tick >= state.sample_interval_ms;
  if (!due || state.point_count < 2) {
    return;
  }
  state.last_sample_tick = now;
  state.initialized = true;

  // The newest sample lands at the right, so once the history is full the whole
  // trace shifts left by one.
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
      // Only the y values move: every x belongs to a position on the time axis
      // rather than to a sample, and was written when the plot was built.
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

}  // namespace simcore::dashboard::graph_widget
