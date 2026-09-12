#include "graph_widget.hpp"

#include <algorithm>

#include "graph_binding.hpp"
#include "graph_plot.hpp"
#include "graph_sampler.hpp"
#include "logger.hpp"
#include "lvgl.h"
#include "widget_draw_buffer.hpp"
#include "widget_inner_box.hpp"

namespace pitrig::dashboard::graph_widget {
namespace {

constexpr char kTag[] = "graph_widget";

void apply_line_color(void* const context, const std::uint32_t rgb) {
  auto& state = *static_cast<State*>(context);
  state.override_rgb = rgb;
}

[[nodiscard]] configuration::ValueRange trace_range(const Config& config, const std::size_t index) {
  return index == 0 ? config.range : config.traces[index - 1].range;
}

[[nodiscard]] std::uint32_t trace_color(const Config& config, const std::size_t index) {
  return index == 0 ? config.line_color : config.traces[index - 1].line_color;
}

}

Collection::~Collection() { destroy(); }

void Collection::destroy() {
  stop_sampling();
  const SamplerLock lock;
  Base::destroy();
}

bool Collection::extend_to(const std::size_t count) {
  const SamplerLock lock;
  return Base::extend_to(count);
}

bool Collection::shrink_to(const std::size_t count) {
  const SamplerLock lock;
  return Base::shrink_to(count);
}

bool Collection::build(State& state, const Layout& layout, const Config& config,
                       const WidgetBinding& binding, const fonts::Registry& fonts) {
  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent, bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.trace_count = std::min(binding.count, config.trace_count + std::size_t{1});
  state.sample_interval_ms = config.sample_interval_ms;
  state.line_width_px = config.line_width_px;
  state.line_inset = plot::line_reserve(config.line_width_px);
  state.override_rgb = configuration::kTransparentColor;
  state.background_rgb = config.frame.background_color == configuration::kTransparentColor
                             ? frame::background_behind(parent)
                             : config.frame.background_color;
  state.last_sample_tick = lv_tick_get();
  state.head_x = 0;
  state.step_carry = 0.0F;
  state.initialized = false;
  state.pending_write.store(0, std::memory_order_relaxed);
  state.pending_read.store(0, std::memory_order_relaxed);

  const std::int32_t border = config.frame.border.width_px;
  const std::int32_t reserve =
      state.line_inset + plot::corner_reserve(config.frame.border.radius_px, border);
  const InnerBox inner = inner_box(config.frame, bounds, reserve);
  state.plot_width = inner.width;
  state.plot_height = inner.height;

  const auto points =
      std::max<std::size_t>(std::min<std::size_t>(config.point_count, kMaximumPoints), 2);
  state.step_px = static_cast<float>(state.plot_width) / static_cast<float>(points - 1);

  const std::int32_t canvas_height = state.plot_height + 2 * state.line_inset;
  if (state.plot_width < 2 || canvas_height < 1) {
    log::error(kTag, "Graph plot area is %d x %d", static_cast<int>(state.plot_width),
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
  lv_draw_buf_t* const buffer =
      lv_draw_buf_create(static_cast<std::uint32_t>(state.plot_width),
                         static_cast<std::uint32_t>(canvas_height), LV_COLOR_FORMAT_RGB565, 0);
  if (buffer == nullptr) {
    log::error(kTag, "No memory for a %d x %d graph plot", static_cast<int>(state.plot_width),
               static_cast<int>(canvas_height));
    return false;
  }
  lv_canvas_set_draw_buf(state.canvas, buffer);
  lv_obj_add_event_cb(state.canvas, release_draw_buffer, LV_EVENT_DELETE, buffer);
  lv_obj_remove_flag(state.canvas, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(state.canvas, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_pos(state.canvas, reserve, reserve - state.line_inset);
  lv_obj_set_size(state.canvas, state.plot_width, canvas_height);
  lv_image_set_inner_align(state.canvas, LV_IMAGE_ALIGN_TILE);
  lv_canvas_fill_bg(state.canvas, lv_color_hex(state.background_rgb), LV_OPA_COVER);

  state.painter.configure(config.frame, box, configuration::kTransparentColor, &apply_line_color,
                          &state);
  state.painter.bind(binding.condition.read, binding.condition.read_context);
  state.painter.bind_caption(binding.caption.read, binding.caption.read_context);
  return true;
}

bool Collection::create(const Layout& layout, const std::span<const Config> configurations,
                        const std::span<const WidgetBinding> bindings,
                        const fonts::Registry& fonts) {
  if (layout.display == nullptr || configurations.size() != bindings.size()) {
    return false;
  }
  const SamplerLock lock;
  const bool created = build_all(bindings.size(), [&](State& state, const std::size_t index) {
    return bindings[index].count > 0 &&
           build(state, layout, configurations[index], bindings[index], fonts);
  });
  start_sampling();
  return created;
}

void Collection::draw_sample(State& state, lv_layer_t& layer,
                             const std::span<const std::int16_t> sample) {
  const float advance = state.step_px + state.step_carry;
  const auto dx = static_cast<std::int32_t>(advance);
  state.step_carry = advance - static_cast<float>(dx);
  const std::int32_t next_x = state.head_x + dx;
  if (dx > 0) {
    plot::clear_columns(state, layer, state.head_x + 1, dx + state.line_inset);
  }
  for (std::size_t index = 0; index < state.trace_count; ++index) {
    Trace& trace = state.traces[index];
    const float y = static_cast<float>(sample[index]) / plot::kSubPixel;
    if (trace.has_previous) {
      const std::uint32_t rgb =
          state.override_rgb == configuration::kTransparentColor ? trace.color : state.override_rgb;
      plot::draw_segment(state, layer, rgb, state.head_x, trace.previous_y, next_x, y);
    }
    trace.previous_y = y;
    trace.has_previous = true;
  }
  state.head_x = next_x % state.plot_width;
}

void Collection::render_state(State& state) {
  state.painter.render();
  if (state.canvas == nullptr) {
    return;
  }
  std::uint8_t read = state.pending_read.load(std::memory_order_relaxed);
  const std::uint8_t write = state.pending_write.load(std::memory_order_acquire);
  if (read == write) {
    return;
  }
  lv_layer_t layer;
  lv_canvas_init_layer(state.canvas, &layer);
  while (read != write) {
    draw_sample(state, layer, state.pending[read]);
    read = static_cast<std::uint8_t>((read + 1) % kPendingSamples);
  }
  lv_canvas_finish_layer(state.canvas, &layer);
  state.pending_read.store(read, std::memory_order_release);

  lv_image_set_offset_x(state.canvas, state.plot_width - 1 - state.head_x);
  lv_obj_invalidate(state.canvas);
}

void Collection::on_released(const std::size_t index) {
  if (index == 0) {
    stop_sampling();
  }
  State& state = states_[index];
  state.canvas = nullptr;
  state.pending_write.store(0, std::memory_order_relaxed);
  state.pending_read.store(0, std::memory_order_relaxed);
}

bool Collection::recreate(const std::size_t index, const Layout& layout,
                          const Config& configuration, const WidgetBinding& binding,
                          const fonts::Registry& fonts) {
  if (binding.count == 0) {
    return false;
  }
  const SamplerLock lock;
  const bool rebuilt = rebuild_one(
      index, [&](State& state) { return build(state, layout, configuration, binding, fonts); });
  start_sampling();
  return rebuilt;
}

}
