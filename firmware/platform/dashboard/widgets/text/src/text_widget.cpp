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

[[nodiscard]] std::int32_t text_width(const lv_font_t* const font,
                                      const char* const text) {
  lv_point_t size{};
  lv_text_get_size(&size, text, font, 0, 0, LV_COORD_MAX,
                   LV_TEXT_FLAG_NONE);
  return size.x;
}

// The value label is sized to its text, so the configured alignment positions
// the label inside the container instead of the text inside a fixed box. LVGL
// aligns against the parent's content area, so the result matches a full-width
// label with the same text alignment.
[[nodiscard]] lv_align_t lv_alignment(const Alignment alignment) {
  switch (alignment) {
    case Alignment::left:
      return LV_ALIGN_LEFT_MID;
    case Alignment::center:
      return LV_ALIGN_CENTER;
    case Alignment::right:
      return LV_ALIGN_RIGHT_MID;
  }
  return LV_ALIGN_CENTER;
}

[[nodiscard]] lv_color_t background_behind(const lv_obj_t* object) {
  while (object != nullptr) {
    if (lv_obj_get_style_bg_opa(object, LV_PART_MAIN) > LV_OPA_TRANSP) {
      return lv_obj_get_style_bg_color(object, LV_PART_MAIN);
    }
    object = lv_obj_get_parent(object);
  }
  return lv_color_black();
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
    const bool has_title = config.title.text.front() != '\0';
  const lv_font_t* const title_font =
      has_title ? fonts.resolve(config.title.font) : nullptr;
  const lv_font_t* const value_font = fonts.resolve(config.value.font);
  if ((has_title && title_font == nullptr) || value_font == nullptr) {
    return false;
  }
  const std::int32_t title_width =
      has_title ? text_width(title_font, config.title.text.data()) : 0;
  const std::int32_t title_height =
      has_title ? lv_font_get_line_height(title_font) : 0;
  std::array<char, telemetry::kTelemetryTextCapacity> unavailable{};
  unavailable_text(config, unavailable);
  const std::int32_t value_width =
      std::max<std::int32_t>(
          text_width(value_font, unavailable.data()),
          lv_font_get_glyph_width(value_font, '8', '\0'));
  const std::int32_t value_height = lv_font_get_line_height(value_font);
  const std::int32_t horizontal_insets =
      2 * config.border.width_px + config.padding.left +
      config.padding.right;
  const std::int32_t vertical_insets =
      2 * config.border.width_px + config.padding.top +
      config.padding.bottom;
  const std::int32_t content_width =
      std::max(value_width, title_width + (has_title ? 8 : 0));
  const std::int32_t content_height =
      value_height + (has_title ? title_height / 2 : 0);

  lv_obj_t* parent{};
  Rect bounds{};
  if (!resolve_widget_bounds(
          layout, config.placement, content_width + horizontal_insets,
          content_height + vertical_insets, false, parent, bounds) ||
      bounds.width <= horizontal_insets ||
      bounds.height <= vertical_insets) {
    // Font metrics come from the uploaded face, so a placement authored against
    // different metrics can be too small. Report what it would have taken.
    log::error(kTag, "Text widget needs %dx%d but is placed at %dx%d",
               static_cast<int>(content_width + horizontal_insets),
               static_cast<int>(content_height + vertical_insets),
               static_cast<int>(config.placement.width),
               static_cast<int>(config.placement.height));
    return false;
  }

  state.source_count = binding.count;
  for (std::size_t index = 0; index < binding.count; ++index) {
    state.sources[index] = {
        .read = binding.sources[index].read,
        .read_context = binding.sources[index].read_context,
        .transform = config.sources[index].transform,
        .free_running = binding.sources[index].fast_updates,
    };
  }
  state.condition_count =
      std::min<std::size_t>(config.condition_count, state.conditions.size());
  for (std::size_t index = 0; index < state.condition_count; ++index) {
    state.conditions[index] = config.conditions[index];
  }
  state.condition_read = binding.condition.read;
  state.condition_context = binding.condition.read_context;
  // The widget as authored is what every rule falls back to, and what LVGL is
  // configured with just below, so the first render has nothing to apply.
  state.static_style = {
      .color = config.value.color,
      .background_color = config.background_color,
      .border_color = config.border.color,
      .blink_ms = 0,
      .hidden = false,
  };
  state.applied_style = state.static_style;
  state.blink_visible = true;
  state.unavailable_text = unavailable;
  copy_text(state.title_text, config.title.text);
  state.container = lv_obj_create(parent);
  lv_obj_remove_style_all(state.container);
  lv_obj_set_pos(state.container, bounds.x, bounds.y);
  lv_obj_set_size(state.container, bounds.width, bounds.height);
  const bool has_background =
      config.background_color != kTransparentColor;
  // An inset background cannot be the container's own fill, which always
  // reaches the border, so it becomes a child sized to leave the frame clear.
  // A rule that repaints the background then targets whichever of the two the
  // widget was built with.
  const std::int32_t inset = config.background_inset_px;
  const bool paints_container = inset == 0;
  if (has_background && paints_container) {
    lv_obj_set_style_bg_color(
        state.container, lv_color_hex(config.background_color),
        LV_PART_MAIN);
  }
  lv_obj_set_style_bg_opa(
      state.container,
      has_background && paints_container ? LV_OPA_COVER : LV_OPA_TRANSP,
      LV_PART_MAIN);
  lv_obj_set_style_border_color(
      state.container, lv_color_hex(config.border.color), LV_PART_MAIN);
  lv_obj_set_style_border_width(state.container, config.border.width_px,
                                LV_PART_MAIN);
  lv_obj_set_style_border_opa(
      state.container,
      config.border.width_px == 0 ? LV_OPA_TRANSP : LV_OPA_COVER,
      LV_PART_MAIN);
  lv_obj_set_style_radius(state.container, config.border.radius_px,
                          LV_PART_MAIN);
  lv_obj_set_style_pad_left(state.container, config.padding.left,
                            LV_PART_MAIN);
  lv_obj_set_style_pad_top(state.container, config.padding.top, LV_PART_MAIN);
  lv_obj_set_style_pad_right(state.container, config.padding.right,
                             LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(state.container, config.padding.bottom,
                              LV_PART_MAIN);
  lv_obj_remove_flag(state.container, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(state.container, LV_OBJ_FLAG_CLICKABLE);
  apply_debug_widget_outline(state.container);

  if (!paints_container) {
    // Created before the value label so it stays behind it. LVGL places a child
    // against the parent's content area, which the border and the widget
    // padding already push inwards, so the padding is subtracted back out to
    // leave exactly `inset` of frame showing.
    const std::int32_t edge = config.border.width_px + inset;
    state.background_fill = lv_obj_create(state.container);
    lv_obj_remove_style_all(state.background_fill);
    lv_obj_set_pos(state.background_fill,
                   inset - static_cast<std::int32_t>(config.padding.left),
                   inset - static_cast<std::int32_t>(config.padding.top));
    lv_obj_set_size(state.background_fill,
                    std::max<std::int32_t>(bounds.width - 2 * edge, 0),
                    std::max<std::int32_t>(bounds.height - 2 * edge, 0));
    lv_obj_set_style_radius(
        state.background_fill,
        std::max<std::int32_t>(config.border.radius_px - inset, 0),
        LV_PART_MAIN);
    if (has_background) {
      lv_obj_set_style_bg_color(state.background_fill,
                                lv_color_hex(config.background_color),
                                LV_PART_MAIN);
    }
    lv_obj_set_style_bg_opa(state.background_fill,
                            has_background ? LV_OPA_COVER : LV_OPA_TRANSP,
                            LV_PART_MAIN);
    lv_obj_remove_flag(state.background_fill, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(state.background_fill, LV_OBJ_FLAG_CLICKABLE);
  }

  if (has_title) {
    if (config.border.width_px > 0) {
      state.caption_gap = lv_obj_create(parent);
      lv_obj_remove_style_all(state.caption_gap);
      lv_obj_set_size(state.caption_gap, title_width + 8,
                      config.border.width_px + 2);
      lv_obj_set_pos(state.caption_gap,
                     bounds.x + (bounds.width - title_width - 8) / 2,
                     bounds.y);
      // The gap masks the border where the caption crosses it, so it matches
      // whatever is painted there. An inset background leaves the frame line
      // over the parent, not over the widget's fill.
      const lv_color_t gap_color =
          has_background && paints_container
              ? lv_color_hex(config.background_color)
              : background_behind(parent);
      state.caption_gap_rgb = lv_color_to_u32(gap_color) & 0x00FF'FFFFU;
      lv_obj_set_style_bg_color(state.caption_gap, gap_color, LV_PART_MAIN);
      lv_obj_set_style_bg_opa(state.caption_gap, LV_OPA_COVER, LV_PART_MAIN);
      lv_obj_remove_flag(state.caption_gap, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_remove_flag(state.caption_gap, LV_OBJ_FLAG_CLICKABLE);
    }

    state.caption = lv_label_create(parent);
    lv_obj_remove_style_all(state.caption);
    lv_label_set_text_static(state.caption, state.title_text.data());
    lv_obj_set_style_text_font(state.caption, title_font, LV_PART_MAIN);
    lv_obj_set_style_text_color(
        state.caption, lv_color_hex(config.title.color), LV_PART_MAIN);
    lv_obj_set_pos(state.caption,
                   bounds.x + (bounds.width - title_width) / 2,
                   bounds.y - title_height / 2 +
                       config.title.offset_y_px);
  }

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

void Collection::apply_style(State& state,
                             const conditions::ResolvedStyle& style) {
  if (style == state.applied_style) {
    return;
  }
  if (style.color != state.applied_style.color) {
    lv_obj_set_style_text_color(state.value_label, lv_color_hex(style.color),
                                LV_PART_MAIN);
  }
  if (style.background_color != state.applied_style.background_color) {
    const bool painted = style.background_color != kTransparentColor;
    // Whichever object carries the background: the container itself, or the
    // inset child that leaves the frame clear.
    lv_obj_t* const filled = state.background_fill != nullptr
                                 ? state.background_fill
                                 : state.container;
    if (painted) {
      lv_obj_set_style_bg_color(filled, lv_color_hex(style.background_color),
                                LV_PART_MAIN);
    }
    lv_obj_set_style_bg_opa(
        filled, painted ? LV_OPA_COVER : LV_OPA_TRANSP, LV_PART_MAIN);
    if (state.caption_gap != nullptr && state.background_fill == nullptr) {
      // The gap masks the border behind the caption, so it has to match
      // whatever the widget is painted with now. An inset background never
      // reaches that line, so the gap keeps the colour it was built with.
      lv_obj_set_style_bg_color(
          state.caption_gap,
          lv_color_hex(painted ? style.background_color
                               : state.caption_gap_rgb),
          LV_PART_MAIN);
    }
  }
  if (style.border_color != state.applied_style.border_color) {
    lv_obj_set_style_border_color(
        state.container, lv_color_hex(style.border_color), LV_PART_MAIN);
  }
  if (style.blink_ms != state.applied_style.blink_ms) {
    // Anchor the phase to the change, so the frame that turns the widget red is
    // one the widget is visible in instead of one it happens to blink out on.
    state.blink_started = lv_tick_get();
    state.blink_visible = true;
  }
  state.applied_style = style;
  apply_visibility(state);
  // Border, background and value are one visual change. Invalidating the whole
  // widget publishes them as a single area, instead of leaving LVGL with
  // separate rectangles that a partial draw buffer can flush one after another.
  lv_obj_invalidate(state.container);
  if (state.caption_gap != nullptr) {
    lv_obj_invalidate(state.caption_gap);
  }
  if (state.caption != nullptr) {
    lv_obj_invalidate(state.caption);
  }
}

void Collection::apply_blink(State& state) {
  const std::uint32_t period = state.applied_style.blink_ms;
  const bool phase =
      period == 0 || (lv_tick_elaps(state.blink_started) % period) < period / 2U;
  if (phase == state.blink_visible) {
    return;
  }
  state.blink_visible = phase;
  apply_visibility(state);
}

void Collection::apply_visibility(State& state) {
  const bool visible = !state.applied_style.hidden && state.blink_visible;
  if (visible == state.visible) {
    return;
  }
  state.visible = visible;
  // The caption and its gap are siblings of the container rather than children,
  // so showing and hiding the widget has to take them along.
  for (lv_obj_t* const object :
       {state.container, state.caption_gap, state.caption}) {
    if (object == nullptr) {
      continue;
    }
    if (visible) {
      lv_obj_remove_flag(object, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(object, LV_OBJ_FLAG_HIDDEN);
    }
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

  const telemetry::TelemetryRead condition =
      state.condition_read != nullptr
          ? state.condition_read(state.condition_context)
          : telemetry::TelemetryRead{};
  if (state.condition_read != nullptr) {
    changed = changed || condition.revision != state.condition_revision ||
              condition.available != state.condition_available;
    state.condition_revision = condition.revision;
    state.condition_available = condition.available;
  }
  // Styling is re-resolved whenever a source moved, while a hold is running
  // down, and while a blink is on, so a widget with no rules keeps costing one
  // revision comparison per source and nothing else.
  if (state.condition_count > 0 &&
      (changed || state.holding || state.applied_style.blink_ms != 0)) {
    conditions::Resolution resolution =
        conditions::resolve({state.conditions.data(), state.condition_count},
                            conditions::condition_value(condition),
                            state.static_style);
    if (resolution.matched) {
      state.held_style = resolution.style;
      state.hold_ms = resolution.hold_ms;
      state.hold_started = lv_tick_get();
      state.holding = resolution.hold_ms > 0;
    } else if (state.holding &&
               lv_tick_elaps(state.hold_started) < state.hold_ms) {
      // The rule stopped matching but its flash has not run out yet, which is
      // what makes a momentary trigger visible at all.
      resolution.style = state.held_style;
    } else {
      state.holding = false;
    }
    apply_style(state, resolution.style);
  }
  // A blink runs off the tick rather than off telemetry, so its phase advances
  // even on a pass where nothing else moved.
  apply_blink(state);
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
  if (state.caption != nullptr) {
    lv_obj_delete(state.caption);
  }
  if (state.caption_gap != nullptr) {
    lv_obj_delete(state.caption_gap);
  }
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
