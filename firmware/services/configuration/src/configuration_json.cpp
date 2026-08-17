#include "configuration_json.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <span>
#include <string_view>

#include "cJSON.h"
#include "esp_heap_caps.h"

namespace simcore::configuration {
namespace {

using Json = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;

// cJSON builds a document out of many small nodes, and the SPIRAM policy sends
// every allocation under 16 KiB to internal RAM, so a large payload would parse
// itself into the scarcest memory the device has. This parser is the only cJSON
// user in the firmware, so pointing its allocator at external memory is safe
// and makes the payload limit a question of PSRAM rather than of SRAM.
void* json_malloc(const std::size_t size) {
  void* const external =
      heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  return external != nullptr ? external : std::malloc(size);
}

void json_free(void* const pointer) { heap_caps_free(pointer); }

void install_json_allocator() {
  static bool installed = false;
  if (installed) {
    return;
  }
  cJSON_Hooks hooks{.malloc_fn = &json_malloc, .free_fn = &json_free};
  cJSON_InitHooks(&hooks);
  installed = true;
}
using KeyList = std::span<const std::string_view>;

// Records the first cause and leaves it untouched afterwards, so a nested
// rejection is reported instead of the generic error its caller would return.
bool reject(ValidationFailure& failure, const ValidationError error,
            const std::string_view object, const std::string_view key = {}) {
  if (!failure.ok()) {
    return false;
  }
  failure.error = error;
  std::size_t length = 0;
  const auto append = [&failure, &length](const std::string_view text) {
    for (const char character : text) {
      if (length + 1 >= failure.path.size()) {
        return;
      }
      failure.path[length++] = character;
    }
  };
  append(object);
  if (!key.empty()) {
    append(".");
    append(key);
  }
  return false;
}

[[nodiscard]] const cJSON* member(const cJSON* const object,
                                  const char* const name) {
  return cJSON_GetObjectItemCaseSensitive(object, name);
}

// Rejects any property the schema does not declare, and any property that
// appears twice in the same object.
[[nodiscard]] bool valid_object(const cJSON* const object,
                                const KeyList allowed,
                                const std::string_view name,
                                ValidationFailure& failure) {
  if (!cJSON_IsObject(object)) {
    return reject(failure, ValidationError::malformed, name);
  }
  for (const cJSON* item = object->child; item != nullptr; item = item->next) {
    if (item->string == nullptr) {
      return reject(failure, ValidationError::malformed, name);
    }
    const std::string_view key{item->string};
    if (std::find(allowed.begin(), allowed.end(), key) == allowed.end()) {
      return reject(failure, ValidationError::unknown_property, name, key);
    }
    for (const cJSON* previous = object->child; previous != item;
         previous = previous->next) {
      if (previous->string != nullptr && key == previous->string) {
        return reject(failure, ValidationError::duplicate_property, name, key);
      }
    }
  }
  return true;
}

template <typename Integer>
[[nodiscard]] bool read_integer(const cJSON* const object,
                                const char* const key, Integer& output,
                                const std::string_view name,
                                ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble) ||
      std::trunc(value->valuedouble) != value->valuedouble ||
      value->valuedouble <
          static_cast<double>(std::numeric_limits<Integer>::lowest()) ||
      value->valuedouble >
          static_cast<double>(std::numeric_limits<Integer>::max())) {
    return reject(failure, ValidationError::malformed, name, key);
  }
  output = static_cast<Integer>(value->valuedouble);
  return true;
}

// Bounded well inside the float range so a scale or offset cannot reach the
// device as an infinity after the narrowing conversion.
constexpr double kMaximumRealMagnitude = 1.0e9;

[[nodiscard]] bool read_float(const cJSON* const object,
                              const char* const key, float& output,
                              const std::string_view name,
                              ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble) ||
      std::abs(value->valuedouble) > kMaximumRealMagnitude) {
    return reject(failure, ValidationError::malformed, name, key);
  }
  output = static_cast<float>(value->valuedouble);
  return true;
}

[[nodiscard]] bool read_boolean(const cJSON* const object,
                                const char* const key, bool& output,
                                const std::string_view name,
                                ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsBool(value)) {
    return reject(failure, ValidationError::malformed, name, key);
  }
  output = cJSON_IsTrue(value);
  return true;
}

template <std::size_t Size>
[[nodiscard]] bool copy_text(const cJSON* const value,
                             std::array<char, Size>& output) {
  if (!cJSON_IsString(value) || value->valuestring == nullptr) {
    return false;
  }
  const std::size_t size = std::strlen(value->valuestring);
  if (size >= output.size()) {
    return false;
  }
  output.fill('\0');
  std::copy_n(value->valuestring, size, output.begin());
  return true;
}

template <std::size_t Size>
[[nodiscard]] bool read_text(const cJSON* const object,
                             const char* const key,
                             std::array<char, Size>& output,
                             const std::string_view name,
                             ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  return copy_text(value, output)
             ? true
             : reject(failure, ValidationError::malformed, name, key);
}

[[nodiscard]] bool read_color(const cJSON* const object,
                              const char* const key,
                              std::uint32_t& output,
                              const std::string_view name,
                              ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsString(value) || value->valuestring == nullptr ||
      std::strlen(value->valuestring) != 7 || value->valuestring[0] != '#') {
    return reject(failure, ValidationError::malformed, name, key);
  }
  std::uint32_t color{};
  for (std::size_t index = 1; index < 7; ++index) {
    const char digit = value->valuestring[index];
    std::uint8_t nibble{};
    if (digit >= '0' && digit <= '9') {
      nibble = static_cast<std::uint8_t>(digit - '0');
    } else if (digit >= 'a' && digit <= 'f') {
      nibble = static_cast<std::uint8_t>(digit - 'a' + 10);
    } else if (digit >= 'A' && digit <= 'F') {
      nibble = static_cast<std::uint8_t>(digit - 'A' + 10);
    } else {
      return reject(failure, ValidationError::malformed, name, key);
    }
    color = (color << 4U) | nibble;
  }
  output = color;
  return true;
}

// Decodes one of the generated wire spellings for a schema enumeration.
template <typename Enum, typename FromName>
[[nodiscard]] bool read_enum(const cJSON* const object,
                             const char* const key, Enum& output,
                             const FromName from_name,
                             const std::string_view name,
                             ValidationFailure& failure) {
  const cJSON* const value = member(object, key);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsString(value) || value->valuestring == nullptr ||
      !from_name(std::string_view{value->valuestring}, output)) {
    return reject(failure, ValidationError::malformed, name, key);
  }
  return true;
}

[[nodiscard]] bool parse_placement(const cJSON* const object,
                                   WidgetPlacement& placement,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "placement";
  return valid_object(object, schema::kWidgetPlacementKeys, kName, failure) &&
         read_integer(object, "x", placement.x, kName, failure) &&
         read_integer(object, "y", placement.y, kName, failure) &&
         read_integer(object, "width", placement.width, kName, failure) &&
         read_integer(object, "height", placement.height, kName, failure);
}

[[nodiscard]] bool parse_font(const cJSON* const object,
                              font_assets::FontSpec& font,
                              ValidationFailure& failure) {
  constexpr std::string_view kName = "font";
  if (!valid_object(object, schema::kFontSpecKeys, kName, failure) ||
      !read_integer(object, "size_px", font.size_px, kName, failure)) {
    return false;
  }
  const cJSON* const family = member(object, "family");
  if (family == nullptr) {
    return true;
  }
  return copy_text(family, font.family)
             ? true
             : reject(failure, ValidationError::malformed, kName, "family");
}

[[nodiscard]] bool parse_optional_placement(const cJSON* const object,
                                            WidgetPlacement& placement,
                                            ValidationFailure& failure) {
  const cJSON* const value = member(object, "placement");
  return value == nullptr || parse_placement(value, placement, failure);
}

[[nodiscard]] bool parse_optional_font(const cJSON* const object,
                                       font_assets::FontSpec& font,
                                       ValidationFailure& failure) {
  const cJSON* const value = member(object, "font");
  return value == nullptr || parse_font(value, font, failure);
}

[[nodiscard]] bool parse_uart(const cJSON* const object,
                              UartTelemetryConfiguration& uart,
                              ValidationFailure& failure) {
  constexpr std::string_view kName = "telemetry_transport.uart";
  return valid_object(object, schema::kUartTelemetryConfigurationKeys, kName,
                      failure) &&
         read_integer(object, "port", uart.port, kName, failure) &&
         read_integer(object, "tx_pin", uart.tx_pin, kName, failure) &&
         read_integer(object, "rx_pin", uart.rx_pin, kName, failure) &&
         read_integer(object, "baud_rate", uart.baud_rate, kName, failure) &&
         read_boolean(object, "silence_esp_logs", uart.silence_esp_logs, kName,
                      failure);
}

[[nodiscard]] bool parse_transport(const cJSON* const object,
                                   TelemetryTransportConfiguration& transport,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "telemetry_transport";
  if (!valid_object(object, schema::kTelemetryTransportConfigurationKeys, kName,
                    failure) ||
      !read_enum(object, "id", transport.id, telemetry_transport_id_from_name,
                 kName, failure)) {
    return false;
  }
  const cJSON* const uart = member(object, "uart");
  return uart == nullptr || parse_uart(uart, transport.uart, failure);
}

[[nodiscard]] bool parse_transform(const cJSON* const object,
                                   ValueTransform& transform,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text.transform";
  if (!valid_object(object, schema::kValueTransformKeys, kName, failure) ||
      !read_enum(object, "type", transform.type, value_transform_type_from_name,
                 kName, failure) ||
      !read_text(object, "prefix", transform.prefix, kName, failure) ||
      !read_text(object, "suffix", transform.suffix, kName, failure)) {
    return false;
  }
  if (transform.type == ValueTransformType::number) {
    return read_integer(object, "decimals", transform.number.decimals, kName,
                        failure) &&
           read_float(object, "scale", transform.number.scale, kName,
                      failure) &&
           read_float(object, "offset", transform.number.offset, kName,
                      failure);
  }
  if (transform.type != ValueTransformType::time) {
    return true;
  }
  const cJSON* const format = member(object, "format");
  if (!cJSON_IsString(format) || format->valuestring == nullptr) {
    return reject(failure, ValidationError::malformed, kName, "format");
  }
  const std::string_view value{format->valuestring};
  if (value == "duration_ms") {
    transform.time.format = transformers::time_transform::Format::duration_ms;
  } else if (value == "signed_duration_ms") {
    transform.time.format =
        transformers::time_transform::Format::signed_duration_ms;
  } else {
    return reject(failure, ValidationError::malformed, kName, "format");
  }
  return true;
}

// Shared by a widget source and by the source its styling rules watch: the two
// carry the same bounded modifier list.
template <typename Source>
[[nodiscard]] bool parse_modifiers(const cJSON* const object, Source& config,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text.source.modifiers";
  const cJSON* const modifiers = member(object, "modifiers");
  if (modifiers == nullptr) {
    return true;
  }
  if (!cJSON_IsArray(modifiers) ||
      cJSON_GetArraySize(modifiers) >
          static_cast<int>(config.modifiers.size())) {
    return reject(failure, ValidationError::malformed, kName);
  }
  const int count = cJSON_GetArraySize(modifiers);
  for (int index = 0; index < count; ++index) {
    const cJSON* const modifier = cJSON_GetArrayItem(modifiers, index);
    if (!valid_object(modifier, schema::kValueModifierKeys, kName, failure) ||
        !read_enum(modifier, "type", config.modifiers[index].type,
                   value_modifier_type_from_name, kName, failure)) {
      return false;
    }
  }
  config.modifier_count = static_cast<std::uint8_t>(count);
  return true;
}

// A widget renders its sources in authored order, so the array is the widget's
// value pipeline rather than a set.
[[nodiscard]] bool parse_sources(const cJSON* const object,
                                 TextWidgetConfiguration& config,
                                 ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text.sources";
  const cJSON* const sources = member(object, "sources");
  if (sources == nullptr) {
    return reject(failure, ValidationError::malformed, kName);
  }
  const int count = cJSON_IsArray(sources) ? cJSON_GetArraySize(sources) : -1;
  if (count <= 0 || count > static_cast<int>(config.sources.size())) {
    return reject(failure, ValidationError::malformed, kName);
  }
  for (int index = 0; index < count; ++index) {
    const cJSON* const source = cJSON_GetArrayItem(sources, index);
    TextSourceConfiguration& parsed = config.sources[index];
    if (!valid_object(source, schema::kTextSourceConfigurationKeys, kName,
                      failure) ||
        !read_text(source, "binding", parsed.binding, kName, failure) ||
        !parse_modifiers(source, parsed, failure)) {
      return false;
    }
    if (const cJSON* const transform = member(source, "transform");
        transform != nullptr &&
        !parse_transform(transform, parsed.transform, failure)) {
      return false;
    }
  }
  config.source_count = static_cast<std::uint8_t>(count);
  return true;
}

// Navigation a tap performs. Optional everywhere it appears; without it the
// object keeps refusing input, which is what every widget did before actions
// existed. The target screen stays a name here — the composition resolves it
// once, so a tap looks nothing up.
[[nodiscard]] bool parse_action(const cJSON* const object,
                                WidgetAction& action,
                                const std::string_view name,
                                ValidationFailure& failure) {
  const cJSON* const value = member(object, "action");
  if (value == nullptr) {
    return true;
  }
  return valid_object(value, schema::kWidgetActionKeys, name, failure) &&
         read_enum(value, "type", action.type, widget_action_type_from_name,
                   name, failure) &&
         read_text(value, "screen", action.screen, name, failure);
}

// Styling rules and the source they watch. Both are optional; a widget with
// neither renders its authored colours and nothing evaluates at render time.
// The ramp sits beside the rules because both read the same watched source; it
// is the colour they fall back to rather than a rule of its own.
[[nodiscard]] bool parse_color_ramp(const cJSON* const object,
                                    WidgetFrame& config,
                                    ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.color_ramp";
  const cJSON* const ramp = member(object, "color_ramp");
  if (ramp == nullptr) {
    return true;
  }
  if (!valid_object(ramp, schema::kColorRampKeys, kName, failure) ||
      !read_enum(ramp, "target", config.color_ramp.target,
                 color_ramp_target_from_name, kName, failure)) {
    return false;
  }
  const cJSON* const stops = member(ramp, "stops");
  if (stops == nullptr) {
    return true;
  }
  const int count = cJSON_IsArray(stops) ? cJSON_GetArraySize(stops) : -1;
  if (count < 0 || count > static_cast<int>(config.color_ramp.stops.size())) {
    return reject(failure, ValidationError::malformed, kName);
  }
  for (int index = 0; index < count; ++index) {
    const cJSON* const stop = cJSON_GetArrayItem(stops, index);
    ColorStop& parsed = config.color_ramp.stops[index];
    if (!valid_object(stop, schema::kColorStopKeys, kName, failure) ||
        !read_float(stop, "at", parsed.at, kName, failure) ||
        !read_color(stop, "color", parsed.color, kName, failure)) {
      return false;
    }
  }
  config.color_ramp.stop_count = static_cast<std::uint8_t>(count);
  return true;
}

[[nodiscard]] bool parse_conditions(const cJSON* const object,
                                    WidgetFrame& config,
                                    ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.conditions";
  if (const cJSON* const source = member(object, "condition_source");
      source != nullptr) {
    constexpr std::string_view kSourceName = "widget.condition_source";
    if (!valid_object(source, schema::kValueSourceConfigurationKeys,
                      kSourceName, failure) ||
        !read_text(source, "binding", config.condition_source.binding,
                   kSourceName, failure) ||
        !parse_modifiers(source, config.condition_source, failure)) {
      return false;
    }
  }

  if (!parse_color_ramp(object, config, failure)) {
    return false;
  }

  const cJSON* const conditions = member(object, "conditions");
  if (conditions == nullptr) {
    return true;
  }
  const int count =
      cJSON_IsArray(conditions) ? cJSON_GetArraySize(conditions) : -1;
  if (count < 0 || count > static_cast<int>(config.conditions.size())) {
    return reject(failure, ValidationError::malformed, kName);
  }
  for (int index = 0; index < count; ++index) {
    const cJSON* const rule = cJSON_GetArrayItem(conditions, index);
    WidgetCondition& parsed = config.conditions[index];
    if (!valid_object(rule, schema::kWidgetConditionKeys, kName, failure) ||
        !read_enum(rule, "op", parsed.op, condition_operator_from_name, kName,
                   failure) ||
        !read_float(rule, "value", parsed.value, kName, failure) ||
        !read_color(rule, "color", parsed.color, kName, failure) ||
        !read_color(rule, "background_color", parsed.background_color, kName,
                    failure) ||
        !read_color(rule, "border_color", parsed.border_color, kName,
                    failure) ||
        !read_boolean(rule, "hidden", parsed.hidden, kName, failure) ||
        !read_integer(rule, "blink_ms", parsed.blink_ms, kName, failure) ||
        !read_integer(rule, "hold_ms", parsed.hold_ms, kName, failure)) {
      return false;
    }
  }
  config.condition_count = static_cast<std::uint8_t>(count);
  return true;
}

// Every widget type carries a frame, so this reads the properties none of them
// has to declare for itself.
[[nodiscard]] bool parse_frame(const cJSON* const object, WidgetFrame& frame,
                               const std::string_view name,
                               ValidationFailure& failure) {
  if (!read_text(object, "id", frame.id, name, failure) ||
      !parse_optional_placement(object, frame.placement, failure) ||
      !read_integer(object, "z_index", frame.z_index, name, failure) ||
      !read_color(object, "background_color", frame.background_color, name,
                  failure) ||
      !read_color(object, "background_grad_color", frame.background_grad_color,
                  name, failure) ||
      !read_enum(object, "background_grad_dir", frame.background_grad_dir,
                 gradient_direction_from_name, name, failure) ||
      !read_integer(object, "background_inset_px", frame.background_inset_px,
                    name, failure) ||
      !parse_action(object, frame.action, "widget.action", failure) ||
      !parse_conditions(object, frame, failure)) {
    return false;
  }

  if (const cJSON* const padding = member(object, "padding");
      padding != nullptr) {
    constexpr std::string_view kPaddingName = "widget.padding";
    if (!valid_object(padding, schema::kWidgetInsetsKeys, kPaddingName,
                      failure) ||
        !read_integer(padding, "left", frame.padding.left, kPaddingName,
                      failure) ||
        !read_integer(padding, "top", frame.padding.top, kPaddingName,
                      failure) ||
        !read_integer(padding, "right", frame.padding.right, kPaddingName,
                      failure) ||
        !read_integer(padding, "bottom", frame.padding.bottom, kPaddingName,
                      failure)) {
      return false;
    }
  }

  if (const cJSON* const title = member(object, "title"); title != nullptr) {
    constexpr std::string_view kTitleName = "widget.title";
    if (!valid_object(title, schema::kWidgetTitleStyleKeys, kTitleName,
                      failure) ||
        !read_text(title, "text", frame.title.text, kTitleName, failure) ||
        !parse_optional_font(title, frame.title.font, failure) ||
        !read_color(title, "color", frame.title.color, kTitleName, failure) ||
        !read_integer(title, "offset_y_px", frame.title.offset_y_px, kTitleName,
                      failure)) {
      return false;
    }
  }

  if (const cJSON* const border = member(object, "border"); border != nullptr) {
    constexpr std::string_view kBorderName = "widget.border";
    if (!valid_object(border, schema::kWidgetBorderKeys, kBorderName,
                      failure) ||
        !read_color(border, "color", frame.border.color, kBorderName,
                    failure) ||
        !read_integer(border, "width_px", frame.border.width_px, kBorderName,
                      failure) ||
        !read_integer(border, "radius_px", frame.border.radius_px, kBorderName,
                      failure)) {
      return false;
    }
  }
  return true;
}

[[nodiscard]] bool parse_value_source(const cJSON* const object,
                                     ValueSourceConfiguration& config,
                                     const std::string_view name,
                                     ValidationFailure& failure) {
  const cJSON* const source = member(object, "source");
  if (source == nullptr) {
    return true;
  }
  return valid_object(source, schema::kValueSourceConfigurationKeys, name,
                      failure) &&
         read_text(source, "binding", config.binding, name, failure) &&
         parse_modifiers(source, config, failure);
}

[[nodiscard]] bool parse_bar_widget(const cJSON* const object,
                                    BarWidgetConfiguration& config,
                                    ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.bar";
  if (!valid_object(object, schema::kBarWidgetConfigurationKeys, kName,
                    failure) ||
      !parse_frame(object, config.frame, kName, failure) ||
      !parse_value_source(object, config.source, kName, failure) ||
      !read_float(object, "minimum", config.range.minimum, kName, failure) ||
      !read_float(object, "maximum", config.range.maximum, kName, failure) ||
      !read_float(object, "origin", config.origin, kName, failure) ||
      !read_enum(object, "orientation", config.orientation,
                 bar_orientation_from_name, kName, failure) ||
      !read_boolean(object, "inverted", config.inverted, kName, failure) ||
      !read_color(object, "fill_color", config.fill_color, kName, failure) ||
      !read_color(object, "fill_grad_color", config.fill_grad_color, kName,
                  failure)) {
    return false;
  }
  // An omitted origin means the low end of the range, which a literal zero
  // cannot express once the window goes negative.
  config.origin_present = member(object, "origin") != nullptr;
  return true;
}

[[nodiscard]] bool parse_arc_widget(const cJSON* const object,
                                    ArcWidgetConfiguration& config,
                                    ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.arc";
  return valid_object(object, schema::kArcWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         parse_value_source(object, config.source, kName, failure) &&
         read_float(object, "minimum", config.range.minimum, kName, failure) &&
         read_float(object, "maximum", config.range.maximum, kName, failure) &&
         read_integer(object, "start_angle_deg", config.start_angle_deg, kName,
                      failure) &&
         read_integer(object, "sweep_deg", config.sweep_deg, kName, failure) &&
         read_integer(object, "thickness_px", config.thickness_px, kName,
                      failure) &&
         read_color(object, "track_color", config.track_color, kName,
                    failure) &&
         read_color(object, "fill_color", config.fill_color, kName, failure) &&
         read_boolean(object, "inverted", config.inverted, kName, failure);
}

[[nodiscard]] bool parse_indicator_segments(const cJSON* const object,
                                            IndicatorWidgetConfiguration& config,
                                            ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.indicator.segments";
  const cJSON* const segments = member(object, "segments");
  if (segments == nullptr) {
    return true;
  }
  const int count =
      cJSON_IsArray(segments) ? cJSON_GetArraySize(segments) : -1;
  if (count < 0 || count > static_cast<int>(config.segments.size())) {
    return reject(failure, ValidationError::malformed, kName);
  }
  for (int index = 0; index < count; ++index) {
    const cJSON* const segment = cJSON_GetArrayItem(segments, index);
    IndicatorSegment& parsed = config.segments[index];
    if (!valid_object(segment, schema::kIndicatorSegmentKeys, kName, failure) ||
        !read_float(segment, "threshold", parsed.threshold, kName, failure) ||
        !read_color(segment, "color", parsed.color, kName, failure)) {
      return false;
    }
  }
  config.segment_count = static_cast<std::uint8_t>(count);
  return true;
}

[[nodiscard]] bool parse_indicator_widget(const cJSON* const object,
                                          IndicatorWidgetConfiguration& config,
                                          ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.indicator";
  return valid_object(object, schema::kIndicatorWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         parse_value_source(object, config.source, kName, failure) &&
         read_float(object, "minimum", config.range.minimum, kName, failure) &&
         read_float(object, "maximum", config.range.maximum, kName, failure) &&
         read_enum(object, "orientation", config.orientation,
                   bar_orientation_from_name, kName, failure) &&
         read_integer(object, "segment_gap_px", config.segment_gap_px, kName,
                      failure) &&
         read_integer(object, "segment_radius_px", config.segment_radius_px,
                      kName, failure) &&
         read_color(object, "off_color", config.off_color, kName, failure) &&
         read_float(object, "blink_threshold", config.blink_threshold, kName,
                    failure) &&
         read_integer(object, "blink_ms", config.blink_ms, kName, failure) &&
         parse_indicator_segments(object, config, failure);
}

[[nodiscard]] bool parse_graph_widget(const cJSON* const object,
                                      GraphWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.graph";
  return valid_object(object, schema::kGraphWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         parse_value_source(object, config.source, kName, failure) &&
         read_float(object, "minimum", config.range.minimum, kName, failure) &&
         read_float(object, "maximum", config.range.maximum, kName, failure) &&
         read_integer(object, "point_count", config.point_count, kName,
                      failure) &&
         read_integer(object, "sample_interval_ms", config.sample_interval_ms,
                      kName, failure) &&
         read_color(object, "line_color", config.line_color, kName, failure) &&
         read_integer(object, "line_width_px", config.line_width_px, kName,
                      failure);
}

[[nodiscard]] bool parse_image_widget(const cJSON* const object,
                                      ImageWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.image";
  return valid_object(object, schema::kImageWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         read_text(object, "image", config.image, kName, failure) &&
         read_color(object, "recolor", config.recolor, kName, failure) &&
         read_integer(object, "recolor_opa", config.recolor_opa, kName,
                      failure);
}

[[nodiscard]] bool parse_shape_widget(const cJSON* const object,
                                      ShapeWidgetConfiguration& config,
                                      ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.shape";
  return valid_object(object, schema::kShapeWidgetConfigurationKeys, kName,
                      failure) &&
         parse_frame(object, config.frame, kName, failure) &&
         read_enum(object, "kind", config.kind, shape_kind_from_name, kName,
                   failure);
}

[[nodiscard]] bool parse_text_widget(const cJSON* const object,
                                     TextWidgetConfiguration& config,
                                     ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text";
  if (!valid_object(object, schema::kTextWidgetConfigurationKeys, kName,
                    failure) ||
      !parse_frame(object, config.frame, kName, failure) ||
      !parse_sources(object, config, failure)) {
    return false;
  }

  const cJSON* const value = member(object, "value");
  if (value == nullptr) {
    return true;
  }
  constexpr std::string_view kValueName = "widget.text.value";
  return valid_object(value, schema::kWidgetValueStyleKeys, kValueName,
                      failure) &&
         parse_optional_font(value, config.value.font, failure) &&
         read_color(value, "color", config.value.color, kValueName, failure) &&
         read_text(value, "unavailable_text", config.value.unavailable_text,
                   kValueName, failure) &&
         read_enum(value, "alignment", config.value.alignment,
                   text_alignment_from_name, kValueName, failure);
}

// Dispatches one element of the heterogeneous widget array into the typed
// storage for its variant and records its authored position.
// Widgets are authored inside a screen but stored in the dashboard-wide pool,
// so this writes the configuration into the pool and leaves the screen holding
// a reference to that slot.
// `owner` is the screen or the group the widget was authored in: both keep an
// ordered reference table into the pool, and which one it is decides the
// widget's LVGL parent and therefore whether its geometry is absolute.
template <typename Owner>
[[nodiscard]] bool parse_widget(const cJSON* const object,
                                DashboardConfiguration& dashboard, Owner& owner,
                                const std::uint8_t screen_index,
                                const std::uint8_t group_index,
                                const bool group_present,
                                ValidationFailure& failure) {
  constexpr std::string_view kName = "widget";
  if (!cJSON_IsObject(object)) {
    return reject(failure, ValidationError::invalid_widget, kName);
  }
  const cJSON* const type = member(object, "type");
  WidgetType widget_type{};
  if (!cJSON_IsString(type) || type->valuestring == nullptr ||
      !widget_type_from_name(std::string_view{type->valuestring},
                             widget_type)) {
    return reject(failure, ValidationError::invalid_widget, kName, "type");
  }
  if (owner.widget_count >= owner.widgets.size()) {
    return group_present
               ? reject(failure, ValidationError::invalid_group, "group",
                        "widgets")
               : reject(failure, ValidationError::invalid_screen, "screen",
                        "widgets");
  }

  std::uint8_t storage_index{};
  // Parenting is stamped once after the variant is parsed, so a widget type
  // knows nothing about screens or groups.
  WidgetFrame* frame{};
  switch (widget_type) {
    case WidgetType::text:
      if (dashboard.text_widget_count >= dashboard.text_widgets.size()) {
        return reject(failure, ValidationError::invalid_dashboard, "dashboard",
                      "text_widgets");
      }
      storage_index = dashboard.text_widget_count;
      if (!parse_text_widget(object, dashboard.text_widgets[storage_index],
                             failure)) {
        return false;
      }
      frame = &dashboard.text_widgets[storage_index].frame;
      ++dashboard.text_widget_count;
      break;
    case WidgetType::shape:
      if (dashboard.shape_widget_count >= dashboard.shape_widgets.size()) {
        return reject(failure, ValidationError::invalid_dashboard, "dashboard",
                      "shape_widgets");
      }
      storage_index = dashboard.shape_widget_count;
      if (!parse_shape_widget(object, dashboard.shape_widgets[storage_index],
                              failure)) {
        return false;
      }
      frame = &dashboard.shape_widgets[storage_index].frame;
      ++dashboard.shape_widget_count;
      break;
    case WidgetType::bar:
      if (dashboard.bar_widget_count >= dashboard.bar_widgets.size()) {
        return reject(failure, ValidationError::invalid_dashboard, "dashboard",
                      "bar_widgets");
      }
      storage_index = dashboard.bar_widget_count;
      if (!parse_bar_widget(object, dashboard.bar_widgets[storage_index],
                            failure)) {
        return false;
      }
      frame = &dashboard.bar_widgets[storage_index].frame;
      ++dashboard.bar_widget_count;
      break;
    case WidgetType::arc:
      if (dashboard.arc_widget_count >= dashboard.arc_widgets.size()) {
        return reject(failure, ValidationError::invalid_dashboard, "dashboard",
                      "arc_widgets");
      }
      storage_index = dashboard.arc_widget_count;
      if (!parse_arc_widget(object, dashboard.arc_widgets[storage_index],
                            failure)) {
        return false;
      }
      frame = &dashboard.arc_widgets[storage_index].frame;
      ++dashboard.arc_widget_count;
      break;
    case WidgetType::indicator:
      if (dashboard.indicator_widget_count >=
          dashboard.indicator_widgets.size()) {
        return reject(failure, ValidationError::invalid_dashboard, "dashboard",
                      "indicator_widgets");
      }
      storage_index = dashboard.indicator_widget_count;
      if (!parse_indicator_widget(
              object, dashboard.indicator_widgets[storage_index], failure)) {
        return false;
      }
      frame = &dashboard.indicator_widgets[storage_index].frame;
      ++dashboard.indicator_widget_count;
      break;
    case WidgetType::image:
      if (dashboard.image_widget_count >= dashboard.image_widgets.size()) {
        return reject(failure, ValidationError::invalid_dashboard, "dashboard",
                      "image_widgets");
      }
      storage_index = dashboard.image_widget_count;
      if (!parse_image_widget(object, dashboard.image_widgets[storage_index],
                              failure)) {
        return false;
      }
      frame = &dashboard.image_widgets[storage_index].frame;
      ++dashboard.image_widget_count;
      break;
    case WidgetType::graph:
      if (dashboard.graph_widget_count >= dashboard.graph_widgets.size()) {
        return reject(failure, ValidationError::invalid_dashboard, "dashboard",
                      "graph_widgets");
      }
      storage_index = dashboard.graph_widget_count;
      if (!parse_graph_widget(object, dashboard.graph_widgets[storage_index],
                              failure)) {
        return false;
      }
      frame = &dashboard.graph_widgets[storage_index].frame;
      ++dashboard.graph_widget_count;
      break;
  }

  frame->screen_index = screen_index;
  frame->group_index = group_index;
  frame->group_present = group_present;
  // Carrying the ordering key on the reference keeps compositing free of
  // widget-type knowledge.
  owner.widgets[owner.widget_count] = {
      .type = widget_type,
      .index = storage_index,
      .z_index = frame->z_index,
  };
  ++owner.widget_count;
  return true;
}

// A group activates on the same comparison a widget restyles on, so this reads
// the same watched source and the same operator; what a match does with it is
// all that differs.
[[nodiscard]] bool parse_group_conditions(const cJSON* const object,
                                          GroupConfiguration& group,
                                          ValidationFailure& failure) {
  constexpr std::string_view kName = "group.conditions";
  if (const cJSON* const source = member(object, "condition_source");
      source != nullptr) {
    constexpr std::string_view kSourceName = "group.condition_source";
    if (!valid_object(source, schema::kValueSourceConfigurationKeys,
                      kSourceName, failure) ||
        !read_text(source, "binding", group.condition_source.binding,
                   kSourceName, failure) ||
        !parse_modifiers(source, group.condition_source, failure)) {
      return false;
    }
  }

  const cJSON* const conditions = member(object, "conditions");
  if (conditions == nullptr) {
    return true;
  }
  const int count =
      cJSON_IsArray(conditions) ? cJSON_GetArraySize(conditions) : -1;
  if (count < 0 || count > static_cast<int>(group.conditions.size())) {
    return reject(failure, ValidationError::invalid_group, kName);
  }
  for (int index = 0; index < count; ++index) {
    const cJSON* const rule = cJSON_GetArrayItem(conditions, index);
    GroupCondition& parsed = group.conditions[index];
    if (!valid_object(rule, schema::kGroupConditionKeys, kName, failure) ||
        !read_enum(rule, "op", parsed.op, condition_operator_from_name, kName,
                   failure) ||
        !read_float(rule, "value", parsed.value, kName, failure) ||
        !read_integer(rule, "hold_ms", parsed.hold_ms, kName, failure)) {
      return false;
    }
  }
  group.condition_count = static_cast<std::uint8_t>(count);
  return true;
}

[[nodiscard]] bool parse_group(const cJSON* const object,
                               DashboardConfiguration& dashboard,
                               ScreenConfiguration& screen,
                               const std::uint8_t screen_index,
                               const std::uint8_t group_index,
                               ValidationFailure& failure) {
  GroupConfiguration& group = screen.groups[group_index];
  constexpr std::string_view kName = "group";
  if (!valid_object(object, schema::kGroupConfigurationKeys, kName, failure) ||
      !read_text(object, "id", group.id, kName, failure) ||
      !parse_optional_placement(object, group.placement, failure) ||
      !read_integer(object, "z_index", group.z_index, kName, failure) ||
      !read_integer(object, "slot", group.slot, kName, failure) ||
      !read_boolean(object, "slot_default", group.slot_default, kName,
                    failure) ||
      !parse_action(object, group.action, "group.action", failure) ||
      !parse_group_conditions(object, group, failure)) {
    return false;
  }
  group.screen_index = screen_index;

  const cJSON* const widgets = member(object, "widgets");
  if (widgets == nullptr) {
    return true;
  }
  if (!cJSON_IsArray(widgets) ||
      cJSON_GetArraySize(widgets) > static_cast<int>(group.widgets.size())) {
    return reject(failure, ValidationError::invalid_group, kName, "widgets");
  }
  const int count = cJSON_GetArraySize(widgets);
  for (int index = 0; index < count; ++index) {
    if (!parse_widget(cJSON_GetArrayItem(widgets, index), dashboard, group,
                      screen_index, group_index, true, failure)) {
      failure.widget_index = static_cast<std::int16_t>(index);
      return false;
    }
  }
  return true;
}

[[nodiscard]] bool parse_screen(const cJSON* const object,
                                DashboardConfiguration& dashboard,
                                const std::uint8_t screen_index,
                                ValidationFailure& failure) {
  ScreenConfiguration& screen = dashboard.screens[screen_index];
  constexpr std::string_view kName = "screen";
  if (!valid_object(object, schema::kScreenConfigurationKeys, kName, failure) ||
      !read_text(object, "id", screen.id, kName, failure) ||
      !read_color(object, "background_color", screen.background_color, kName,
                  failure)) {
    return false;
  }

  if (const cJSON* const groups = member(object, "groups"); groups != nullptr) {
    if (!cJSON_IsArray(groups) ||
        cJSON_GetArraySize(groups) > static_cast<int>(screen.groups.size())) {
      return reject(failure, ValidationError::invalid_group, kName, "groups");
    }
    const int count = cJSON_GetArraySize(groups);
    // Counted up front: a group's widgets are parsed before the loop ends, and
    // validation walks the groups a widget's group_index points into.
    screen.group_count = static_cast<std::uint8_t>(count);
    for (int index = 0; index < count; ++index) {
      if (!parse_group(cJSON_GetArrayItem(groups, index), dashboard, screen,
                       screen_index, static_cast<std::uint8_t>(index),
                       failure)) {
        return false;
      }
    }
  }

  const cJSON* const widgets = member(object, "widgets");
  if (widgets == nullptr) {
    return true;
  }
  if (!cJSON_IsArray(widgets) ||
      cJSON_GetArraySize(widgets) >
          static_cast<int>(screen.widgets.size())) {
    return reject(failure, ValidationError::invalid_screen, kName, "widgets");
  }
  const int count = cJSON_GetArraySize(widgets);
  for (int index = 0; index < count; ++index) {
    if (!parse_widget(cJSON_GetArrayItem(widgets, index), dashboard, screen,
                      screen_index, 0, false, failure)) {
      failure.widget_index = static_cast<std::int16_t>(index);
      return false;
    }
  }
  return true;
}

[[nodiscard]] bool parse_dashboard(const cJSON* const object,
                                   DashboardConfiguration& dashboard,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "dashboard";
  if (!valid_object(object, schema::kDashboardConfigurationKeys, kName,
                    failure)) {
    return false;
  }
  const cJSON* const screens = member(object, "screens");
  if (screens == nullptr) {
    return true;
  }
  if (!cJSON_IsArray(screens) ||
      cJSON_GetArraySize(screens) >
          static_cast<int>(dashboard.screens.size())) {
    return reject(failure, ValidationError::invalid_screen, kName, "screens");
  }
  const int count = cJSON_GetArraySize(screens);
  for (int index = 0; index < count; ++index) {
    if (!parse_screen(cJSON_GetArrayItem(screens, index), dashboard,
                      static_cast<std::uint8_t>(index), failure)) {
      failure.screen_index = static_cast<std::int16_t>(index);
      return false;
    }
  }
  dashboard.screen_count = static_cast<std::uint8_t>(count);
  return true;
}

[[nodiscard]] ValidationFailure parse_root(
    const cJSON* const root, const ValidationContext& profile,
    ApplicationConfiguration& configuration) {
  ValidationFailure failure{};
  constexpr std::string_view kName = "configuration";
  if (!valid_object(root, schema::kApplicationConfigurationKeys, kName,
                    failure)) {
    return failure;
  }

  const cJSON* const board = member(root, "board");
  if (!cJSON_IsString(board) || board->valuestring == nullptr ||
      !board_id_from_name(std::string_view{board->valuestring},
                          configuration.board.id)) {
    (void)reject(failure, ValidationError::invalid_board, kName, "board");
    return failure;
  }

  const cJSON* const hardware = member(root, "hardware");
  if (hardware != nullptr &&
      (!cJSON_IsArray(hardware) || cJSON_GetArraySize(hardware) != 0)) {
    (void)reject(failure, ValidationError::invalid_hardware, kName, "hardware");
    return failure;
  }

  const cJSON* const transport = member(root, "telemetry_transport");
  if (transport != nullptr) {
    configuration.telemetry_transport_present = true;
    if (!parse_transport(transport, configuration.telemetry_transport,
                         failure)) {
      return failure;
    }
  }

  const cJSON* const dashboard = member(root, "dashboard");
  if (dashboard != nullptr &&
      !parse_dashboard(dashboard, configuration.dashboard, failure)) {
    return failure;
  }
  return validate_configuration(configuration, profile);
}

}  // namespace

ValidationFailure parse_configuration_json(
    const std::span<const std::uint8_t> input,
    const ValidationContext& profile,
    ApplicationConfiguration& configuration) {
  ValidationFailure failure{};
  if (input.empty() || input.size() > kMaximumPayloadSize) {
    (void)reject(failure, ValidationError::malformed, "configuration");
    return failure;
  }
  install_json_allocator();
  const char* parse_end{};
  Json root(cJSON_ParseWithLengthOpts(
                reinterpret_cast<const char*>(input.data()), input.size(),
                &parse_end, false),
            &cJSON_Delete);
  const char* const input_end =
      reinterpret_cast<const char*>(input.data()) + input.size();
  while (root && parse_end < input_end &&
         (*parse_end == ' ' || *parse_end == '\t')) {
    ++parse_end;
  }
  if (!root || parse_end != input_end) {
    (void)reject(failure, ValidationError::malformed, "configuration");
    return failure;
  }

  // Callers provide dedicated scratch storage. Reset and populate it directly
  // so the multi-kilobyte runtime configuration is never duplicated on a task
  // stack.
  configuration = {};
  return parse_root(root.get(), profile, configuration);
}

}  // namespace simcore::configuration
