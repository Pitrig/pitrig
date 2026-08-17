#include "text_widget.hpp"

#include <algorithm>
#include <array>
#include <charconv>
#include <cstdint>
#include <string_view>
#include <system_error>

#include "dashboard_fonts.hpp"
#include "dashboard_layout_internal.hpp"
#include "esp_lvgl_port.h"
#include "lvgl.h"
#include "logger.hpp"
#include "number_transform.hpp"
#include "text_writer.hpp"
#include "time_transform.hpp"
#include "widget_binding.hpp"

namespace simcore::dashboard::text_widget {
namespace {

constexpr char kTag[] = "text_widget";

// Telemetry changes wake the render timer early through the dashboard's render
// trigger, so this period is the fallback poll and the cadence of free-running
// module sources. It follows the display refresh cadence: a telemetry-backed
// widget whose source slot did not advance skips the
// read-transform-format-compare work entirely, so an idle dashboard costs one
// revision comparison per widget per period.
constexpr std::uint32_t kRenderPeriodMs = LV_DEF_REFR_PERIOD;

[[nodiscard]] std::int32_t text_width_of(const lv_font_t* const font,
                                         const char* const text) {
  lv_point_t size{};
  lv_text_get_size(&size, text, font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
  return size.x;
}

// The value label is sized to its text, so the configured alignment positions
// the label inside the container instead of the text inside a fixed box. LVGL
// aligns against the parent's content area, so the result matches a full-width
// label with the same text alignment.
[[nodiscard]] lv_align_t lv_alignment(const Alignment alignment) {
  switch (alignment) {
    case Alignment::top_left:
      return LV_ALIGN_TOP_LEFT;
    case Alignment::top_center:
      return LV_ALIGN_TOP_MID;
    case Alignment::top_right:
      return LV_ALIGN_TOP_RIGHT;
    case Alignment::left:
      return LV_ALIGN_LEFT_MID;
    case Alignment::center:
      return LV_ALIGN_CENTER;
    case Alignment::right:
      return LV_ALIGN_RIGHT_MID;
    case Alignment::bottom_left:
      return LV_ALIGN_BOTTOM_LEFT;
    case Alignment::bottom_center:
      return LV_ALIGN_BOTTOM_MID;
    case Alignment::bottom_right:
      return LV_ALIGN_BOTTOM_RIGHT;
  }
  return LV_ALIGN_CENTER;
}

// Where a rule's value colour lands for this widget type. The frame resolves
// the colour and calls this with the label it was given as its context.
void apply_value_color(void* const context, const std::uint32_t rgb) {
  lv_obj_set_style_text_color(static_cast<lv_obj_t*>(context),
                              lv_color_hex(rgb), LV_PART_MAIN);
}

template <std::size_t DestinationSize, std::size_t SourceSize>
void copy_text(std::array<char, DestinationSize>& destination,
               const std::array<char, SourceSize>& source) {
  destination.fill('\0');
  const auto terminator = std::find(source.begin(), source.end(), '\0');
  const std::size_t source_length =
      static_cast<std::size_t>(std::distance(source.begin(), terminator));
  const std::size_t length = std::min(DestinationSize - 1, source_length);
  std::copy_n(source.begin(), length, destination.begin());
}

[[nodiscard]] bool source_text(
    const telemetry::TelemetryRead& value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  if (!value.available) {
    return false;
  }
  if (value.value.source_text.front() != '\0' ||
      value.handle.type == telemetry::ValueType::text) {
    output = value.value.source_text;
    return true;
  }
  if (value.handle.type == telemetry::ValueType::boolean) {
    constexpr std::array<char, 6> kTrue{'t', 'r', 'u', 'e', '\0', '\0'};
    constexpr std::array<char, 6> kFalse{'f', 'a', 'l', 's', 'e', '\0'};
    copy_text(output,
              value.value.typed.boolean_value ? kTrue : kFalse);
    return true;
  }
  std::to_chars_result result{};
  switch (value.handle.type) {
    case telemetry::ValueType::uint32:
      result = std::to_chars(output.data(), output.data() + output.size() - 1,
                             value.value.typed.uint32_value);
      break;
    case telemetry::ValueType::int32:
      result = std::to_chars(output.data(), output.data() + output.size() - 1,
                             value.value.typed.int32_value);
      break;
    case telemetry::ValueType::float32:
      result = std::to_chars(output.data(), output.data() + output.size() - 1,
                             value.value.typed.float32_value);
      break;
    case telemetry::ValueType::text:
    case telemetry::ValueType::boolean:
      return false;
  }
  if (result.ec != std::errc{}) {
    return false;
  }
  *result.ptr = '\0';
  return true;
}

// The value a transform produces, before its affixes.
[[nodiscard]] bool transform_body(
    const configuration::ValueTransform& transform,
    const telemetry::TelemetryRead& value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  switch (transform.type) {
    case configuration::ValueTransformType::none:
      return source_text(value, output);
    case configuration::ValueTransformType::time:
      if (value.handle.type == telemetry::ValueType::uint32) {
        return transformers::time_transform::apply(
            transform.time, value.value.typed.uint32_value, output);
      }
      if (value.handle.type == telemetry::ValueType::int32) {
        return transformers::time_transform::apply(
            transform.time, value.value.typed.int32_value, output);
      }
      return false;
    case configuration::ValueTransformType::number:
      switch (value.handle.type) {
        case telemetry::ValueType::uint32:
          return transformers::number_transform::apply(
              transform.number, value.value.typed.uint32_value, output);
        case telemetry::ValueType::int32:
          return transformers::number_transform::apply(
              transform.number, value.value.typed.int32_value, output);
        case telemetry::ValueType::float32:
          return transformers::number_transform::apply(
              transform.number, value.value.typed.float32_value, output);
        case telemetry::ValueType::text:
          // Sources that format their number on the PC stay usable; a source
          // that is not a number renders the placeholder instead.
          return transformers::number_transform::apply(
              transform.number, transformers::text_view(value.value.source_text),
              output);
        case telemetry::ValueType::boolean:
          return false;
      }
      return false;
  }
  return false;
}

// Wraps a rendered body in its affixes. They belong to the transform rather
// than to one of its types, so an untransformed value can carry a unit too.
[[nodiscard]] bool compose(
    const configuration::ValueTransform& transform, const std::string_view body,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  transformers::TextWriter writer(output);
  if (writer.append(transformers::text_view(transform.prefix)) &&
      writer.append(body) &&
      writer.append(transformers::text_view(transform.suffix))) {
    return true;
  }
  // The value outranks its decoration: a source string long enough to crowd
  // out the affixes keeps its own text rather than losing everything.
  transformers::TextWriter value_only(output);
  return value_only.append(body);
}

// The zero a widget renders while its value is unavailable, run through the
// widget's own transform.
[[nodiscard]] bool zero_body(
    const configuration::ValueTransform& transform,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  switch (transform.type) {
    case configuration::ValueTransformType::none:
      return false;
    case configuration::ValueTransformType::time:
      return transform.time.format ==
                     transformers::time_transform::Format::signed_duration_ms
                 ? transformers::time_transform::apply(
                       transform.time, std::int32_t{0}, output)
                 : transformers::time_transform::apply(
                       transform.time, std::uint32_t{0}, output);
    case configuration::ValueTransformType::number:
      return transformers::number_transform::apply(
          transform.number, std::uint32_t{0}, output);
  }
  return false;
}

// The zero one source shows while it has no value: rendered through its own
// transform, so a plain value reads 0 and a time value keeps its format with
// every field zeroed.
void placeholder_value(
    const configuration::ValueTransform& transform,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  std::array<char, telemetry::kTelemetryTextCapacity> body{};
  if (!zero_body(transform, body)) {
    constexpr std::array<char, 2> kZero{'0', '\0'};
    copy_text(body, kZero);
  }
  if (!compose(transform, transformers::text_view(body), output)) {
    output = body;
  }
}

[[nodiscard]] bool transform_value(
    const configuration::ValueTransform& transform,
    const telemetry::TelemetryRead& value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  if (!value.available) {
    return false;
  }
  std::array<char, telemetry::kTelemetryTextCapacity> body{};
  return transform_body(transform, value, body) &&
         compose(transform, transformers::text_view(body), output);
}

// A binding is usable only once every source resolved to a callback.
[[nodiscard]] bool complete(const WidgetBinding& binding) {
  if (binding.count == 0 || binding.count > binding.sources.size()) {
    return false;
  }
  for (std::size_t index = 0; index < binding.count; ++index) {
    if (binding.sources[index].read == nullptr ||
        binding.sources[index].read_context == nullptr) {
      return false;
    }
  }
  return true;
}

// The text one source contributes to the widget string. An unavailable source
// falls back to its own placeholder, so a live neighbour keeps updating.
void source_text_for(
    const configuration::ValueTransform& transform,
    const telemetry::TelemetryRead& value,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  if (!transform_value(transform, value, output)) {
    placeholder_value(transform, output);
  }
}

// What a widget shows before any of its sources has a value. An explicit
// unavailable_text wins; otherwise every source contributes its placeholder,
// which for a single-source widget is that source's zero.
void unavailable_text(
    const Config& config,
    std::array<char, telemetry::kTelemetryTextCapacity>& output) {
  if (config.value.unavailable_text.front() != '\0') {
    copy_text(output, config.value.unavailable_text);
    return;
  }
  transformers::TextWriter writer(output);
  for (std::size_t index = 0; index < config.source_count; ++index) {
    std::array<char, telemetry::kTelemetryTextCapacity> part{};
    placeholder_value(config.sources[index].transform, part);
    if (!writer.append(transformers::text_view(part))) {
      return;
    }
  }
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

// Builds the LVGL objects for one widget into an already-cleared state.
// Callers hold the LVGL lock. On failure the state is left partially built
// and the caller must release it.
bool Collection::build(State& state, const Layout& layout,
                      const Config& config, const WidgetBinding& binding,
                      const fonts::Registry& fonts) {
  // Geometry, box and styling rules are the shared frame every widget type
  // carries; only the title, the value style and the sources are text's own.
  const configuration::WidgetFrame& frame = config.frame;
  const lv_font_t* const value_font = fonts.resolve(config.value.font);
  if (value_font == nullptr) {
    return false;
  }
  std::array<char, telemetry::kTelemetryTextCapacity> unavailable{};
  unavailable_text(config, unavailable);
  const std::int32_t value_width = std::max<std::int32_t>(
      text_width_of(value_font, unavailable.data()),
      lv_font_get_glyph_width(value_font, '8', '\0'));
  const std::int32_t value_height = lv_font_get_line_height(value_font);

  lv_obj_t* parent{};
  Rect bounds{};
  frame::Box box{};
  if (!frame::build(layout, frame, kTag, value_width, value_height, false, fonts,
                    parent, bounds, box)) {
    return false;
  }
  const std::int32_t title_height = box.caption_height;
  const bool has_title = title_height > 0;

  state.source_count = binding.count;
  for (std::size_t index = 0; index < binding.count; ++index) {
    state.sources[index] = {
        .read = binding.sources[index].read,
        .read_context = binding.sources[index].read_context,
        .transform = config.sources[index].transform,
        .free_running = binding.sources[index].fast_updates,
    };
  }
  state.unavailable_text = unavailable;
  state.container = box.container;

  state.value_label = lv_label_create(state.container);
  lv_obj_remove_style_all(state.value_label);
  // Width follows the text: changing a value invalidates the glyphs it covers
  // plus what it uncovers, not the full inner width of the widget. A 192 px
  // digit costs its own box instead of the whole GEAR widget. The height stays
  // the line height so the baseline cannot shift between values.
  lv_obj_set_size(state.value_label, LV_SIZE_CONTENT, value_height);
  lv_obj_set_style_text_font(state.value_label, value_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(
      state.value_label, lv_color_hex(config.value.color), LV_PART_MAIN);
  lv_obj_align(state.value_label, lv_alignment(config.value.alignment), 0,
               has_title ? title_height / 4 : 0);

  state.painter.configure(frame, box, config.value.color, &apply_value_color,
                          state.value_label);
  state.painter.bind(binding.condition.read, binding.condition.read_context);
  return true;
}

bool Collection::create(
    const Layout& layout, const std::span<const Config> configurations,
    const std::span<const WidgetBinding> bindings,
    const fonts::Registry& fonts) {
  if (layout.display == nullptr || bindings.size() > states_.size() ||
      configurations.size() != bindings.size() || created_ ||
      !lvgl_port_lock(0)) {
    return false;
  }

  created_ = true;
  for (std::size_t widget = 0; widget < bindings.size(); ++widget) {
    const WidgetBinding& binding = bindings[widget];
    if (!complete(binding) ||
        !build(states_[count_], layout, configurations[widget], binding,
               fonts)) {
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
  // timer_ is created, deleted, and read only under the LVGL lock, which the
  // caller holds, so this cannot observe a timer mid-teardown.
  if (timer_ != nullptr) {
    lv_timer_ready(timer_);
  }
}



void Collection::render_state(State& state) {
  // A telemetry slot advances its revision only when the stored value really
  // changed, so a widget whose sources all stood still needs no transform,
  // formatting, or compare. Free-running module sources report no revision and
  // always re-render.
  const bool first_render = !state.initialized;
  std::array<telemetry::TelemetryRead, kMaximumSources> values{};
  bool changed = first_render;
  bool any_available = false;
  for (std::size_t index = 0; index < state.source_count; ++index) {
    Source& source = state.sources[index];
    values[index] = source.read(source.read_context);
    changed = changed || source.free_running ||
              values[index].revision != source.rendered_revision ||
              values[index].available != source.rendered_available;
    // Recorded here rather than while formatting, so a composition that runs
    // out of room still leaves every source compared against what it read.
    source.rendered_revision = values[index].revision;
    source.rendered_available = values[index].available;
    any_available = any_available || values[index].available;
  }

  // Conditional colour, hiding and blink are the frame's business, and its
  // watched source is not one of these, so it gates itself.
  state.painter.render();
  if (!changed) {
    return;
  }

  std::array<char, telemetry::kTelemetryTextCapacity> next{};
  transformers::TextWriter writer(next);
  for (std::size_t index = 0; index < state.source_count; ++index) {
    std::array<char, telemetry::kTelemetryTextCapacity> part{};
    source_text_for(state.sources[index].transform, values[index], part);
    if (!writer.append(transformers::text_view(part))) {
      break;
    }
  }
  state.initialized = true;
  // Every source silent means the widget has nothing of its own to show yet.
  if (!any_available) {
    next = state.unavailable_text;
  }
  // A changed source can still transform to the same text, so keep the
  // comparison before touching LVGL.
  if (!first_render && state.displayed_text == next) {
    return;
  }
  state.displayed_text = next;
  // lv_label_set_text_static() marks the label for refresh and invalidates it.
  lv_label_set_text_static(state.value_label, state.displayed_text.data());
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
                          const WidgetBinding& binding,
                          const fonts::Registry& fonts) {
  if (!created_ || index >= count_ || !complete(binding) ||
      !lvgl_port_lock(0)) {
    return false;
  }
  State& state = states_[index];
  release(state);
  const bool built = build(state, layout, configuration, binding, fonts);
  if (built) {
    // A fresh lv_label carries LVGL's placeholder text until something sets it.
    // Rendering before the lock is released keeps that from reaching the
    // display between a rebuild and the next timer tick.
    render_state(state);
  } else {
    release(state);
  }
  lvgl_port_unlock();
  return built;
}

}  // namespace simcore::dashboard::text_widget
