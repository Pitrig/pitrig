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
  state.override_rgb = rgb;
}

[[nodiscard]] configuration::ValueRange trace_range(const Config& config,
                                                    const std::size_t index) {
  return index == 0 ? config.range : config.traces[index - 1].range;
}

[[nodiscard]] std::uint32_t trace_color(const Config& config,
                                        const std::size_t index) {
  return index == 0 ? config.line_color : config.traces[index - 1].line_color;
}

void release_plot_buffer(lv_event_t* const event) {
  auto* const buffer =
      static_cast<lv_draw_buf_t*>(lv_event_get_user_data(event));
  if (buffer != nullptr) {
    lv_draw_buf_destroy(buffer);
  }
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
                  const std::uint32_t rgb, const std::int32_t x0,
                  const std::int32_t y0, const std::int32_t x1,
                  const std::int32_t y1) {
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
  state.sample_interval_ms = config.sample_interval_ms;
  state.line_width_px = config.line_width_px;
  state.line_inset = line_reserve(config.line_width_px);
  state.override_rgb = configuration::kTransparentColor;
  state.background_rgb =
      config.frame.background_color == configuration::kTransparentColor
          ? 0x000000
          : config.frame.background_color;
  state.last_sample_tick = lv_tick_get();
  state.head_x = 0;
  state.step_carry = 0.0F;
  state.initialized = false;

  const std::int32_t border = config.frame.border.width_px;
  const std::int32_t reserve =
      state.line_inset + corner_reserve(config.frame.border.radius_px, border);
  state.plot_width = std::max<std::int32_t>(
      bounds.width - 2 * border - config.frame.padding.left -
          config.frame.padding.right - 2 * reserve,
      0);
  state.plot_height = std::max<std::int32_t>(
      bounds.height - 2 * border - config.frame.padding.top -
          config.frame.padding.bottom - 2 * reserve,
      0);

  const auto points = std::max<std::size_t>(
      std::min<std::size_t>(config.point_count, kMaximumPoints), 2);
  state.step_px =
      static_cast<float>(state.plot_width) / static_cast<float>(points - 1);

  const std::int32_t canvas_height = state.plot_height + 2 * state.line_inset;
  if (state.plot_width < 2 || canvas_height < 1) {
    log::error(kTag, "Graph plot area is %d x %d",
               static_cast<int>(state.plot_width),
               static_cast<int>(canvas_height));
    return false;
  }

  for (std::size_t index = 0; index < state.trace_count; ++index) {
    Trace& trace = state.traces[index];
    trace.read = binding.sources[index].read;
    trace.read_context = binding.sources[index].read_context;
    trace.range = trace_range(config, index);
    trace.color = trace_color(config, index);
    trace.has_previous = false;
  }

  state.canvas = lv_canvas_create(box.container);
  if (state.canvas == nullptr) {
    log::error(kTag, "Failed to create graph canvas");
    return false;
  }
  lv_draw_buf_t* const buffer = lv_draw_buf_create(
      static_cast<std::uint32_t>(state.plot_width),
      static_cast<std::uint32_t>(canvas_height), LV_COLOR_FORMAT_RGB565, 0);
  if (buffer == nullptr) {
    log::error(kTag, "No memory for a %d x %d graph plot",
               static_cast<int>(state.plot_width),
               static_cast<int>(canvas_height));
    return false;
  }
  lv_canvas_set_draw_buf(state.canvas, buffer);
  lv_obj_add_event_cb(state.canvas, release_plot_buffer, LV_EVENT_DELETE,
                      buffer);
  lv_obj_remove_flag(state.canvas, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(state.canvas, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_pos(state.canvas, reserve, reserve - state.line_inset);
  lv_obj_set_size(state.canvas, state.plot_width, canvas_height);
  lv_image_set_inner_align(state.canvas, LV_IMAGE_ALIGN_TILE);
  lv_canvas_fill_bg(state.canvas, lv_color_hex(state.background_rgb),
                    LV_OPA_COVER);

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
  if (!due || state.canvas == nullptr) {
    return;
  }
  state.last_sample_tick = now;
  const bool first = !state.initialized;
  state.initialized = true;

  const float advance = first ? 0.0F : state.step_px + state.step_carry;
  const auto dx = static_cast<std::int32_t>(advance);
  state.step_carry = advance - static_cast<float>(dx);
  const std::int32_t next_x = state.head_x + dx;

  lv_layer_t layer;
  lv_canvas_init_layer(state.canvas, &layer);
  if (dx > 0) {
    clear_columns(state, layer, state.head_x + 1, dx + state.line_inset);
  }
  for (std::size_t index = 0; index < state.trace_count; ++index) {
    Trace& trace = state.traces[index];
    const telemetry::TelemetryRead value = trace.read(trace.read_context);
    const std::optional<double> numeric = conditions::condition_value(value);
    const float fraction =
        numeric.has_value() ? conditions::range_fraction(*numeric, trace.range)
                            : 0.0F;
    const std::int32_t y =
        state.line_inset + sample_y(state.plot_height, fraction);
    if (trace.has_previous && !first) {
      const std::uint32_t rgb =
          state.override_rgb == configuration::kTransparentColor
              ? trace.color
              : state.override_rgb;
      draw_segment(state, layer, rgb, state.head_x, trace.previous_y, next_x,
                   y);
    }
    trace.previous_y = y;
    trace.has_previous = true;
  }
  lv_canvas_finish_layer(state.canvas, &layer);

  state.head_x = next_x % state.plot_width;
  lv_image_set_offset_x(state.canvas, state.plot_width - 1 - state.head_x);
  lv_obj_invalidate(state.canvas);
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
