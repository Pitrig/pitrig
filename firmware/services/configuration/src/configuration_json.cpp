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

namespace simcore::configuration {
namespace {

using Json = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;
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

[[nodiscard]] bool parse_delta_time_module(const cJSON* const object,
                                           DeltaTimeConfiguration& config,
                                           ValidationFailure& failure) {
  constexpr std::string_view kName = "delta_time";
  if (!valid_object(object, schema::kDeltaTimeConfigurationKeys, kName,
                    failure) ||
      !read_text(object, "placeholder", config.placeholder, kName, failure) ||
      !read_enum(object, "unavailable_behavior", config.unavailable_behavior,
                 delta_time_unavailable_behavior_from_name, kName, failure)) {
    return false;
  }
  const cJSON* const scale = member(object, "scale");
  if (scale == nullptr) {
    return true;
  }
  constexpr std::string_view kScaleName = "delta_time.scale";
  return valid_object(scale, schema::kDeltaTimeScaleConfigurationKeys,
                      kScaleName, failure) &&
         read_boolean(scale, "enabled", config.scale.enabled, kScaleName,
                      failure) &&
         read_boolean(scale, "show_sign", config.scale.show_sign, kScaleName,
                      failure) &&
         read_integer(scale, "range_ms", config.scale.range_ms, kScaleName,
                      failure);
}

[[nodiscard]] bool parse_delta_time_widget(
    const cJSON* const object, DeltaTimeWidgetConfiguration& config,
    ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.delta_time";
  if (!valid_object(object, schema::kDeltaTimeWidgetConfigurationKeys, kName,
                    failure) ||
      !read_text(object, "id", config.id, kName, failure) ||
      !parse_optional_placement(object, config.placement, failure) ||
      !read_integer(object, "z_index", config.z_index, kName, failure) ||
      !parse_optional_font(object, config.font, failure) ||
      !read_color(object, "faster_color", config.faster_color, kName,
                  failure) ||
      !read_color(object, "slower_color", config.slower_color, kName,
                  failure) ||
      !read_color(object, "neutral_color", config.neutral_color, kName,
                  failure)) {
    return false;
  }
  const cJSON* const scale = member(object, "scale");
  if (scale == nullptr) {
    return true;
  }
  constexpr std::string_view kScaleName = "widget.delta_time.scale";
  return valid_object(scale, schema::kDeltaTimeScaleStyleKeys, kScaleName,
                      failure) &&
         read_integer(scale, "vertical_padding_px",
                      config.scale.vertical_padding_px, kScaleName, failure) &&
         read_integer(scale, "border_width_px", config.scale.border_width_px,
                      kScaleName, failure) &&
         read_integer(scale, "border_radius_px", config.scale.border_radius_px,
                      kScaleName, failure);
}

[[nodiscard]] bool parse_transform(const cJSON* const object,
                                   ValueTransform& transform,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text.transform";
  if (!valid_object(object, schema::kValueTransformKeys, kName, failure) ||
      !read_enum(object, "type", transform.type, value_transform_type_from_name,
                 kName, failure) ||
      !read_text(object, "prefix", transform.time.prefix, kName, failure) ||
      !read_text(object, "suffix", transform.time.suffix, kName, failure)) {
    return false;
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

[[nodiscard]] bool parse_modifiers(const cJSON* const object,
                                   TextWidgetConfiguration& config,
                                   ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text.modifiers";
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

[[nodiscard]] bool parse_text_widget(const cJSON* const object,
                                     TextWidgetConfiguration& config,
                                     ValidationFailure& failure) {
  constexpr std::string_view kName = "widget.text";
  if (!valid_object(object, schema::kTextWidgetConfigurationKeys, kName,
                    failure) ||
      !read_text(object, "id", config.id, kName, failure) ||
      !read_text(object, "binding", config.binding, kName, failure) ||
      !parse_optional_placement(object, config.placement, failure) ||
      !read_integer(object, "z_index", config.z_index, kName, failure) ||
      !read_color(object, "background_color", config.background_color, kName,
                  failure) ||
      !parse_modifiers(object, config, failure)) {
    return false;
  }

  if (const cJSON* const transform = member(object, "transform");
      transform != nullptr && !parse_transform(transform, config.transform,
                                               failure)) {
    return false;
  }

  if (const cJSON* const padding = member(object, "padding");
      padding != nullptr) {
    constexpr std::string_view kPaddingName = "widget.text.padding";
    if (!valid_object(padding, schema::kWidgetInsetsKeys, kPaddingName,
                      failure) ||
        !read_integer(padding, "left", config.padding.left, kPaddingName,
                      failure) ||
        !read_integer(padding, "top", config.padding.top, kPaddingName,
                      failure) ||
        !read_integer(padding, "right", config.padding.right, kPaddingName,
                      failure) ||
        !read_integer(padding, "bottom", config.padding.bottom, kPaddingName,
                      failure)) {
      return false;
    }
  }

  if (const cJSON* const border = member(object, "border"); border != nullptr) {
    constexpr std::string_view kBorderName = "widget.text.border";
    if (!valid_object(border, schema::kWidgetBorderKeys, kBorderName,
                      failure) ||
        !read_color(border, "color", config.border.color, kBorderName,
                    failure) ||
        !read_integer(border, "width_px", config.border.width_px, kBorderName,
                      failure) ||
        !read_integer(border, "radius_px", config.border.radius_px, kBorderName,
                      failure)) {
      return false;
    }
  }

  if (const cJSON* const title = member(object, "title"); title != nullptr) {
    constexpr std::string_view kTitleName = "widget.text.title";
    if (!valid_object(title, schema::kWidgetTitleStyleKeys, kTitleName,
                      failure) ||
        !read_text(title, "text", config.title.text, kTitleName, failure) ||
        !parse_optional_font(title, config.title.font, failure) ||
        !read_color(title, "color", config.title.color, kTitleName, failure) ||
        !read_integer(title, "offset_y_px", config.title.offset_y_px,
                      kTitleName, failure)) {
      return false;
    }
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
[[nodiscard]] bool parse_widget(const cJSON* const object,
                                ScreenConfiguration& screen,
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
  if (screen.widget_count >= screen.widgets.size()) {
    return reject(failure, ValidationError::invalid_screen, "screen",
                  "widgets");
  }

  std::uint8_t storage_index{};
  switch (widget_type) {
    case WidgetType::text:
      if (screen.text_widget_count >= screen.text_widgets.size()) {
        return reject(failure, ValidationError::invalid_screen, "screen",
                      "widgets");
      }
      storage_index = screen.text_widget_count;
      if (!parse_text_widget(object, screen.text_widgets[storage_index],
                             failure)) {
        return false;
      }
      ++screen.text_widget_count;
      break;
    case WidgetType::delta_time:
      if (screen.delta_time_widget_count >= screen.delta_time_widgets.size()) {
        return reject(failure, ValidationError::invalid_screen, "screen",
                      "widgets");
      }
      storage_index = screen.delta_time_widget_count;
      if (!parse_delta_time_widget(
              object, screen.delta_time_widgets[storage_index], failure)) {
        return false;
      }
      ++screen.delta_time_widget_count;
      break;
  }

  // Carrying the ordering key here keeps compositing free of widget-type
  // knowledge.
  const std::int16_t z_index =
      widget_type == WidgetType::text
          ? screen.text_widgets[storage_index].z_index
          : screen.delta_time_widgets[storage_index].z_index;
  screen.widgets[screen.widget_count] = {
      .type = widget_type,
      .index = storage_index,
      .z_index = z_index,
  };
  ++screen.widget_count;
  return true;
}

[[nodiscard]] bool parse_screen(const cJSON* const object,
                                ScreenConfiguration& screen,
                                ValidationFailure& failure) {
  constexpr std::string_view kName = "screen";
  if (!valid_object(object, schema::kScreenConfigurationKeys, kName, failure) ||
      !read_text(object, "id", screen.id, kName, failure) ||
      !read_color(object, "background_color", screen.background_color, kName,
                  failure)) {
    return false;
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
    if (!parse_widget(cJSON_GetArrayItem(widgets, index), screen, failure)) {
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
    if (!parse_screen(cJSON_GetArrayItem(screens, index),
                      dashboard.screens[index], failure)) {
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

  const cJSON* const delta_time_module = member(root, "delta_time");
  if (delta_time_module != nullptr) {
    configuration.delta_time_present = true;
    if (!parse_delta_time_module(delta_time_module, configuration.delta_time,
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
