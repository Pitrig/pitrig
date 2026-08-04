#include "configuration_json.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <initializer_list>
#include <limits>
#include <memory>
#include <string_view>

#include "cJSON.h"

namespace simcore::configuration {
namespace {

using Json = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;

[[nodiscard]] bool valid_object(
    const cJSON* const object,
    const std::initializer_list<std::string_view> allowed_keys) {
  if (!cJSON_IsObject(object)) {
    return false;
  }
  for (const cJSON* item = object->child; item != nullptr; item = item->next) {
    if (item->string == nullptr ||
        std::find(allowed_keys.begin(), allowed_keys.end(), item->string) ==
            allowed_keys.end()) {
      return false;
    }
    for (const cJSON* previous = object->child; previous != item;
         previous = previous->next) {
      if (previous->string != nullptr &&
          std::strcmp(previous->string, item->string) == 0) {
        return false;
      }
    }
  }
  return true;
}

[[nodiscard]] const cJSON* member(const cJSON* const object,
                                  const char* const name) {
  return cJSON_GetObjectItemCaseSensitive(object, name);
}

template <typename Integer>
[[nodiscard]] bool read_integer(const cJSON* const object,
                                const char* const name, Integer& output) {
  const cJSON* const value = member(object, name);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsNumber(value) || !std::isfinite(value->valuedouble) ||
      std::trunc(value->valuedouble) != value->valuedouble ||
      value->valuedouble <
          static_cast<double>(std::numeric_limits<Integer>::lowest()) ||
      value->valuedouble >
          static_cast<double>(std::numeric_limits<Integer>::max())) {
    return false;
  }
  output = static_cast<Integer>(value->valuedouble);
  return true;
}

[[nodiscard]] bool read_boolean(const cJSON* const object,
                                const char* const name, bool& output) {
  const cJSON* const value = member(object, name);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsBool(value)) {
    return false;
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
                             const char* const name,
                             std::array<char, Size>& output) {
  const cJSON* const value = member(object, name);
  return value == nullptr || copy_text(value, output);
}

[[nodiscard]] bool read_color(const cJSON* const object,
                              const char* const name,
                              std::uint32_t& output) {
  const cJSON* const value = member(object, name);
  if (value == nullptr) {
    return true;
  }
  if (!cJSON_IsString(value) || value->valuestring == nullptr ||
      std::strlen(value->valuestring) != 7 || value->valuestring[0] != '#') {
    return false;
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
      return false;
    }
    color = (color << 4U) | nibble;
  }
  output = color;
  return true;
}

[[nodiscard]] bool parse_placement(const cJSON* const object,
                                   dashboard::Placement& placement) {
  return valid_object(object, {"x", "y", "width", "height"}) &&
         read_integer(object, "x", placement.x) &&
         read_integer(object, "y", placement.y) &&
         read_integer(object, "width", placement.width) &&
         read_integer(object, "height", placement.height);
}

[[nodiscard]] bool parse_font(const cJSON* const object,
                              dashboard::FontSpec& font) {
  if (!valid_object(object, {"family", "size_px"}) ||
      !read_integer(object, "size_px", font.size_px)) {
    return false;
  }
  const cJSON* const family = member(object, "family");
  if (family == nullptr) {
    return true;
  }
  if (!cJSON_IsString(family) || family->valuestring == nullptr) {
    return false;
  }
  const std::string_view value{family->valuestring};
  if (value == "roboto_mono") {
    font.family = dashboard::FontFamily::roboto_mono;
  } else if (value == "lcd") {
    font.family = dashboard::FontFamily::lcd;
  } else if (value == "montserrat") {
    font.family = dashboard::FontFamily::montserrat;
  } else {
    return false;
  }
  return true;
}

[[nodiscard]] bool parse_optional_placement(
    const cJSON* const object, dashboard::Placement& placement) {
  const cJSON* const value = member(object, "placement");
  return value == nullptr || parse_placement(value, placement);
}

[[nodiscard]] bool parse_optional_font(const cJSON* const object,
                                       dashboard::FontSpec& font) {
  const cJSON* const value = member(object, "font");
  return value == nullptr || parse_font(value, font);
}

[[nodiscard]] bool parse_uart(const cJSON* const object,
                              UartTelemetryConfiguration& uart) {
  return valid_object(object, {"port", "tx_pin", "rx_pin", "baud_rate",
                               "silence_esp_logs"}) &&
         read_integer(object, "port", uart.port) &&
         read_integer(object, "tx_pin", uart.tx_pin) &&
         read_integer(object, "rx_pin", uart.rx_pin) &&
         read_integer(object, "baud_rate", uart.baud_rate) &&
         read_boolean(object, "silence_esp_logs", uart.silence_esp_logs);
}

[[nodiscard]] bool parse_transport(
    const cJSON* const object, TelemetryTransportConfiguration& transport) {
  if (!valid_object(object, {"id", "uart"})) {
    return false;
  }
  const cJSON* const id = member(object, "id");
  if (id != nullptr) {
    if (!cJSON_IsString(id) || id->valuestring == nullptr) {
      return false;
    }
    const std::string_view value{id->valuestring};
    if (value == "board_default") {
      transport.id = TelemetryTransportId::board_default;
    } else if (value == "native_usb_cdc") {
      transport.id = TelemetryTransportId::native_usb_cdc;
    } else if (value == "uart") {
      transport.id = TelemetryTransportId::uart;
    } else {
      return false;
    }
  }
  const cJSON* const uart = member(object, "uart");
  return uart == nullptr || parse_uart(uart, transport.uart);
}

[[nodiscard]] bool parse_lap_timer_module(const cJSON* const object,
                                          lap_timer::Config& config) {
  return valid_object(object, {"telemetry_only", "telemetry_timeout_ms"}) &&
         read_boolean(object, "telemetry_only", config.telemetry_only) &&
         read_integer(object, "telemetry_timeout_ms",
                      config.telemetry_timeout_ms);
}

[[nodiscard]] bool parse_delta_time_module(const cJSON* const object,
                                            delta_time::Config& config) {
  if (!valid_object(object,
                    {"unavailable_behavior", "placeholder", "scale"}) ||
      !read_text(object, "placeholder", config.placeholder)) {
    return false;
  }
  const cJSON* const behavior = member(object, "unavailable_behavior");
  if (behavior != nullptr) {
    if (!cJSON_IsString(behavior) || behavior->valuestring == nullptr) {
      return false;
    }
    const std::string_view value{behavior->valuestring};
    if (value == "hide") {
      config.unavailable_behavior = delta_time::UnavailableBehavior::hide;
    } else if (value == "placeholder") {
      config.unavailable_behavior =
          delta_time::UnavailableBehavior::placeholder;
    } else if (value == "zero") {
      config.unavailable_behavior = delta_time::UnavailableBehavior::zero;
    } else {
      return false;
    }
  }
  const cJSON* const scale = member(object, "scale");
  return scale == nullptr ||
         (valid_object(scale, {"enabled", "show_sign", "range_ms"}) &&
          read_boolean(scale, "enabled", config.scale.enabled) &&
          read_boolean(scale, "show_sign", config.scale.show_sign) &&
          read_integer(scale, "range_ms", config.scale.range_ms));
}

[[nodiscard]] bool parse_lap_timer_widget(
    const cJSON* const object, dashboard::lap_timer_widget::Config& config) {
  return valid_object(object, {"placement", "font", "text_color"}) &&
         parse_optional_placement(object, config.placement) &&
         parse_optional_font(object, config.font) &&
         read_color(object, "text_color", config.text_color);
}

[[nodiscard]] bool parse_delta_time_widget(
    const cJSON* const object, dashboard::delta_time_widget::Config& config) {
  if (!valid_object(object, {"placement", "font", "faster_color",
                             "slower_color", "neutral_color", "scale"}) ||
      !parse_optional_placement(object, config.placement) ||
      !parse_optional_font(object, config.font) ||
      !read_color(object, "faster_color", config.faster_color) ||
      !read_color(object, "slower_color", config.slower_color) ||
      !read_color(object, "neutral_color", config.neutral_color)) {
    return false;
  }
  const cJSON* const scale = member(object, "scale");
  return scale == nullptr ||
         (valid_object(scale, {"vertical_padding_px", "border_width_px",
                               "border_radius_px"}) &&
          read_integer(scale, "vertical_padding_px",
                       config.scale.vertical_padding_px) &&
          read_integer(scale, "border_width_px", config.scale.border_width_px) &&
          read_integer(scale, "border_radius_px",
                       config.scale.border_radius_px));
}

[[nodiscard]] bool parse_text_widget(
    const cJSON* const object, dashboard::text_widget::Config& config) {
  if (!valid_object(object, {"binding", "placement", "padding", "border",
                             "title", "value", "background_color"}) ||
      !read_text(object, "binding", config.binding) ||
      !parse_optional_placement(object, config.placement) ||
      !read_color(object, "background_color", config.background_color)) {
    return false;
  }
  const cJSON* const padding = member(object, "padding");
  if (padding != nullptr &&
      (!valid_object(padding, {"left", "top", "right", "bottom"}) ||
       !read_integer(padding, "left", config.padding.left) ||
       !read_integer(padding, "top", config.padding.top) ||
       !read_integer(padding, "right", config.padding.right) ||
       !read_integer(padding, "bottom", config.padding.bottom))) {
    return false;
  }
  const cJSON* const border = member(object, "border");
  if (border != nullptr &&
      (!valid_object(border, {"color", "width_px", "radius_px"}) ||
       !read_color(border, "color", config.border.color) ||
       !read_integer(border, "width_px", config.border.width_px) ||
       !read_integer(border, "radius_px", config.border.radius_px))) {
    return false;
  }
  const cJSON* const title = member(object, "title");
  if (title != nullptr &&
      (!valid_object(title, {"text", "font", "color", "offset_y_px"}) ||
       !read_text(title, "text", config.title.text) ||
       !parse_optional_font(title, config.title.font) ||
       !read_color(title, "color", config.title.color) ||
       !read_integer(title, "offset_y_px", config.title.offset_y_px))) {
    return false;
  }
  const cJSON* const value = member(object, "value");
  if (value == nullptr) {
    return true;
  }
  if (!valid_object(value,
                    {"font", "color", "alignment", "unavailable_text"}) ||
      !parse_optional_font(value, config.value.font) ||
      !read_color(value, "color", config.value.color) ||
      !read_text(value, "unavailable_text", config.value.unavailable_text)) {
    return false;
  }
  const cJSON* const alignment = member(value, "alignment");
  if (alignment == nullptr) {
    return true;
  }
  if (!cJSON_IsString(alignment) || alignment->valuestring == nullptr) {
    return false;
  }
  const std::string_view alignment_value{alignment->valuestring};
  if (alignment_value == "left") {
    config.value.alignment = dashboard::text_widget::Alignment::left;
  } else if (alignment_value == "center") {
    config.value.alignment = dashboard::text_widget::Alignment::center;
  } else if (alignment_value == "right") {
    config.value.alignment = dashboard::text_widget::Alignment::right;
  } else {
    return false;
  }
  return true;
}

[[nodiscard]] bool parse_widgets(const cJSON* const object,
                                 DashboardConfiguration& dashboard) {
  if (!valid_object(object, {"lap_timer", "delta_time", "text"})) {
    return false;
  }
  const cJSON* const lap_timer_widget = member(object, "lap_timer");
  if (lap_timer_widget != nullptr) {
    dashboard.lap_timer_present = true;
    if (!parse_lap_timer_widget(lap_timer_widget, dashboard.lap_timer)) {
      return false;
    }
  }
  const cJSON* const delta_time_widget = member(object, "delta_time");
  if (delta_time_widget != nullptr) {
    dashboard.delta_time_present = true;
    if (!parse_delta_time_widget(delta_time_widget, dashboard.delta_time)) {
      return false;
    }
  }
  const cJSON* const text_widgets = member(object, "text");
  if (text_widgets == nullptr) {
    return true;
  }
  if (!cJSON_IsArray(text_widgets) ||
      cJSON_GetArraySize(text_widgets) >
          static_cast<int>(dashboard.text_widgets.size())) {
    return false;
  }
  const int count = cJSON_GetArraySize(text_widgets);
  for (int index = 0; index < count; ++index) {
    if (!parse_text_widget(cJSON_GetArrayItem(text_widgets, index),
                           dashboard.text_widgets[index])) {
      return false;
    }
  }
  dashboard.text_widget_count = static_cast<std::uint8_t>(count);
  return true;
}

[[nodiscard]] bool parse_dashboard(const cJSON* const object,
                                   DashboardConfiguration& dashboard) {
  if (!valid_object(object, {"widgets"})) {
    return false;
  }
  const cJSON* const widgets = member(object, "widgets");
  return widgets == nullptr || parse_widgets(widgets, dashboard);
}

[[nodiscard]] ValidationError parse_root(
    const cJSON* const root, const BoardValidationProfile& profile,
    ApplicationConfiguration& configuration) {
  if (!valid_object(root, {"board", "hardware", "telemetry_transport",
                           "lap_timer", "delta_time", "dashboard"})) {
    return ValidationError::malformed;
  }
  const cJSON* const board = member(root, "board");
  if (!cJSON_IsString(board) || board->valuestring == nullptr) {
    return ValidationError::invalid_board;
  }
  if (!board_id_from_name(board->valuestring, configuration.board.id)) {
    return ValidationError::invalid_board;
  }

  const cJSON* const hardware = member(root, "hardware");
  if (hardware != nullptr &&
      (!cJSON_IsArray(hardware) || cJSON_GetArraySize(hardware) != 0)) {
    return ValidationError::invalid_hardware;
  }

  const cJSON* const transport = member(root, "telemetry_transport");
  if (transport != nullptr) {
    configuration.telemetry_transport_present = true;
    if (!parse_transport(transport, configuration.telemetry_transport)) {
      return ValidationError::invalid_transport;
    }
  }

  const cJSON* const lap_timer_module = member(root, "lap_timer");
  if (lap_timer_module != nullptr) {
    configuration.lap_timer_present = true;
    if (!parse_lap_timer_module(lap_timer_module,
                                configuration.lap_timer)) {
      return ValidationError::invalid_module;
    }
  }
  const cJSON* const delta_time_module = member(root, "delta_time");
  if (delta_time_module != nullptr) {
    configuration.delta_time_present = true;
    if (!parse_delta_time_module(delta_time_module,
                                 configuration.delta_time)) {
      return ValidationError::invalid_module;
    }
  }
  const cJSON* const dashboard = member(root, "dashboard");
  if (dashboard != nullptr &&
      !parse_dashboard(dashboard, configuration.dashboard)) {
    return ValidationError::invalid_dashboard;
  }
  return validate_configuration(configuration, profile);
}

}  // namespace

ValidationError parse_configuration_json(
    const std::span<const std::uint8_t> input,
    const BoardValidationProfile& profile,
    ApplicationConfiguration& configuration) {
  if (input.empty() || input.size() > kMaximumPayloadSize) {
    return ValidationError::malformed;
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
    return ValidationError::malformed;
  }

  // Callers provide dedicated scratch storage. Reset and populate it directly
  // so the 2+ KiB runtime configuration is never duplicated on a task stack.
  configuration = {};
  return parse_root(root.get(), profile, configuration);
}

}  // namespace simcore::configuration
