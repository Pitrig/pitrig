#include "arc_widget.hpp"

#include <algorithm>

#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "widget_conditions.hpp"

namespace simcore::dashboard::arc_widget {
namespace {

constexpr char kTag[] = "arc_widget";

// Telemetry changes wake the render timer early through the dashboard's render
// trigger, so this is the fallback poll and the blink cadence.
constexpr std::uint32_t kRenderPeriodMs = LV_DEF_REFR_PERIOD;

// The sweep is expressed in per-mille rather than in degrees so a long arc on a
// large display still moves smoothly.
constexpr std::int32_t kSweepResolution = 1'000;

// Where a rule's value colour lands for this widget type.
void apply_indicator_color(void* const context, const std::uint32_t rgb) {
  lv_obj_set_style_arc_color(static_cast<lv_obj_t*>(context), lv_color_hex(rgb),
                             LV_PART_INDICATOR);
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
  // An arc has no intrinsic size: the placement is the whole of it.
  if (!frame::build(layout, config.frame, kTag, 0, 0, false, fonts, parent,
                    bounds, box)) {
    return false;
  }
  state.container = box.container;
  state.read = binding.read;
  state.read_context = binding.read_context;
  state.range = config.range;
  state.inverted = config.inverted;
  state.free_running = binding.fast_updates;

  const std::int32_t border = config.frame.border.width_px;
  const std::int32_t inner_width = std::max<std::int32_t>(
      bounds.width - 2 * border - config.frame.padding.left -
          config.frame.padding.right,
      0);
  const std::int32_t inner_height = std::max<std::int32_t>(
      bounds.height - 2 * border - config.frame.padding.top -
          config.frame.padding.bottom,
      0);

  state.arc = lv_arc_create(box.container);
  lv_obj_remove_style_all(state.arc);
  lv_obj_set_pos(state.arc, 0, 0);
  lv_obj_set_size(state.arc, inner_width, inner_height);
  // The knob is the draggable handle of an input control, and the dashboard has
  // no input; leaving it on would draw a dot at the end of every gauge.
  lv_obj_remove_flag(state.arc, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(state.arc, LV_OBJ_FLAG_SCROLLABLE);
  lv_arc_set_mode(state.arc, LV_ARC_MODE_NORMAL);
  lv_arc_set_bg_angles(state.arc, config.start_angle_deg,
                       config.start_angle_deg + config.sweep_deg);
  lv_arc_set_range(state.arc, 0, kSweepResolution);
  lv_arc_set_value(state.arc, 0);
  lv_obj_set_style_arc_width(state.arc, config.thickness_px, LV_PART_MAIN);
  lv_obj_set_style_arc_width(state.arc, config.thickness_px, LV_PART_INDICATOR);
  lv_obj_set_style_arc_color(state.arc, lv_color_hex(config.fill_color),
                             LV_PART_INDICATOR);
  lv_obj_set_style_arc_opa(state.arc, LV_OPA_COVER, LV_PART_INDICATOR);
  // An unpainted track is what an arc drawn over a shape wants, so a missing
  // colour hides the background part rather than guessing one.
  const bool has_track = config.track_color != configuration::kTransparentColor;
  lv_obj_set_style_arc_color(
      state.arc, lv_color_hex(has_track ? config.track_color : 0x000000),
      LV_PART_MAIN);
  lv_obj_set_style_arc_opa(state.arc, has_track ? LV_OPA_COVER : LV_OPA_TRANSP,
                           LV_PART_MAIN);
  state.drawn_per_mille = -1;

  state.painter.configure(config.frame, box, config.fill_color,
                          &apply_indicator_color, state.arc);
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
  const telemetry::TelemetryRead value = state.read(state.read_context);
  const bool first_render = !state.initialized;
  const bool changed = first_render || state.free_running ||
                       value.revision != state.rendered_revision ||
                       value.available != state.rendered_available;
  state.rendered_revision = value.revision;
  state.rendered_available = value.available;
  state.painter.render();
  if (!changed) {
    return;
  }
  state.initialized = true;

  // An unavailable source reads as empty rather than holding its last sweep.
  const std::optional<double> numeric = conditions::condition_value(value);
  const float fraction =
      numeric.has_value() ? conditions::range_fraction(*numeric, state.range)
                          : 0.0F;
  const auto per_mille = static_cast<std::int32_t>(
      static_cast<float>(kSweepResolution) *
          (state.inverted ? 1.0F - fraction : fraction) +
      0.5F);
  if (!first_render && per_mille == state.drawn_per_mille) {
    return;
  }
  state.drawn_per_mille = per_mille;
  lv_arc_set_value(state.arc, per_mille);
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

}  // namespace simcore::dashboard::arc_widget
