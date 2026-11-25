#include "graph_widget.hpp"

#include <algorithm>

#include "graph_binding.hpp"
#include "graph_draw.hpp"
#include "graph_plot.hpp"
#include "graph_sampler.hpp"
#include "logger.hpp"
#include "lvgl.h"
#include "widget_inner_box.hpp"

namespace pitrig::dashboard::graph_widget {
namespace {

constexpr char kTag[] = "graph_widget";
constexpr std::int32_t kSweepGapLineWidths = 3;
constexpr std::int32_t kSweepGapPlotDivisor = 4;

void apply_line_color(void* const context, const std::uint32_t rgb) {
  auto& state = *static_cast<State*>(context);
  state.override_rgb = rgb;
}

void release_history(lv_event_t* const event) { lv_free(lv_event_get_user_data(event)); }

[[nodiscard]] lv_obj_t* create_plot(State& state, lv_obj_t* const parent) {
  auto* const history = static_cast<History*>(lv_malloc(sizeof(History)));
  if (history == nullptr) {
    return nullptr;
  }
  lv_obj_t* const plot = lv_obj_create(parent);
  if (plot == nullptr) {
    lv_free(history);
    return nullptr;
  }
  lv_obj_add_event_cb(plot, release_history, LV_EVENT_DELETE, history);
  state.history = history;
  lv_obj_remove_style_all(plot);
  lv_obj_remove_flag(plot, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(plot, LV_OBJ_FLAG_CLICKABLE);
  draw::attach(plot, state);
  return plot;
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
  state.stored = 0;
  state.newest = 0;
  state.sequence = 0;
  state.initialized = false;
  state.pending_write.store(0, std::memory_order_relaxed);
  state.pending_read.store(0, std::memory_order_relaxed);

  const std::int32_t border = config.frame.border.width_px;
  const std::int32_t reserve =
      state.line_inset + corner_reserve(config.frame.border.radius_px, border);
  const InnerBox inner = inner_box(config.frame, bounds, reserve);
  state.plot_width = inner.width;
  state.plot_height = inner.height;
  state.sweep = config.sweep;
  state.sweep_gap =
      config.sweep ? std::min<std::int32_t>(kSweepGapLineWidths * config.line_width_px,
                                            state.plot_width / kSweepGapPlotDivisor)
                   : 0;

  const auto points =
      std::max<std::size_t>(std::min<std::size_t>(config.point_count, kMaximumPoints), 2);
  state.points = static_cast<std::uint16_t>(points);
  state.step_px = static_cast<float>(state.plot_width) / static_cast<float>(points - 1);

  const std::int32_t plot_height = state.plot_height + 2 * state.line_inset;
  if (state.plot_width < 2 || plot_height < 1) {
    log::error(kTag, "Graph plot area is %d x %d", static_cast<int>(state.plot_width),
               static_cast<int>(plot_height));
    return false;
  }

  for (std::size_t index = 0; index < state.trace_count; ++index) {
    Trace& trace = state.traces[index];
    trace.read = binding.sources[index].read;
    trace.read_context = binding.sources[index].read_context;
    trace.range = trace_range(config, index);
    trace.color = trace_color(config, index);
  }

  state.plot = create_plot(state, box.container);
  if (state.plot == nullptr) {
    log::error(kTag, "No memory for a graph plot");
    return false;
  }
  lv_obj_set_pos(state.plot, reserve, reserve - state.line_inset);
  lv_obj_set_size(state.plot, state.plot_width, plot_height);

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

void Collection::store_sample(State& state, const std::span<const std::int16_t> sample) {
  History& history = *state.history;
  state.newest = static_cast<std::uint16_t>((state.newest + 1) % state.points);
  for (std::size_t index = 0; index < state.trace_count; ++index) {
    history.y[index][state.newest] = static_cast<float>(sample[index]) / plot::kSubPixel + 0.5F;
  }
  history.line_rgb[state.newest] = state.override_rgb;
  if (state.stored < state.points) {
    ++state.stored;
  }
  ++state.sequence;
}

void Collection::render_state(State& state) {
  state.painter.render();
  if (state.plot == nullptr || state.history == nullptr) {
    return;
  }
  std::uint8_t read = state.pending_read.load(std::memory_order_relaxed);
  const std::uint8_t write = state.pending_write.load(std::memory_order_acquire);
  if (read == write) {
    return;
  }
  const std::uint32_t previous_sequence = state.sequence;
  while (read != write) {
    store_sample(state, state.pending[read]);
    read = static_cast<std::uint8_t>((read + 1) % kPendingSamples);
  }
  state.pending_read.store(read, std::memory_order_release);
  plot::invalidate(state, previous_sequence);
}

void Collection::on_released(const std::size_t index) {
  if (index == 0) {
    stop_sampling();
  }
  State& state = states_[index];
  state.plot = nullptr;
  state.history = nullptr;
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
