#include "configuration_json.hpp"

#include <algorithm>
#include <cstdint>
#include <memory>
#include <span>
#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_readers.hpp"
#include "json_value_pipeline.hpp"
#include "json_widgets.hpp"
#include "cJSON.h"

// The document walk: root, transport, screens, groups, and the widget arrays
// within them. What a single value or a single widget means is read by the
// json_* units this drives.
namespace simcore::configuration {
using namespace json;  // NOLINT(google-build-using-namespace) — the readers are
                       // this unit's own vocabulary, split out for size only.
namespace {

using Json = std::unique_ptr<cJSON, decltype(&cJSON_Delete)>;

// Which sections a document carries is answered by the generated key list it is
// parsed against, rather than by a second table saying the same thing. A
// section absent from the list is one this document may neither set nor clear.
[[nodiscard]] bool owns(const KeyList keys, const std::string_view section) {
  return std::find(keys.begin(), keys.end(), section) != keys.end();
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
    if (!parse_widget(cJSON_GetArrayItem(widgets, index), dashboard,
                      ReferenceTable{screen.widgets, &screen.widget_count},
                      screen_index, ParentRef{}, 0, failure)) {
      if (failure.widget_index < 0) {
        failure.widget_index = static_cast<std::int16_t>(index);
      }
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
    const cJSON* const root, const KeyList keys,
    const ValidationContext& profile,
    ApplicationConfiguration& configuration) {
  ValidationFailure failure{};
  constexpr std::string_view kName = "configuration";
  if (!valid_object(root, keys, kName, failure)) {
    return failure;
  }

  // Every document carries the board identifier, which is what makes each one
  // answerable on its own for arriving at the wrong hardware.
  const cJSON* const board = member(root, "board");
  if (!cJSON_IsString(board) || board->valuestring == nullptr ||
      !board_id_from_name(std::string_view{board->valuestring},
                          configuration.board.id)) {
    (void)reject(failure, ValidationError::invalid_board, kName, "board");
    return failure;
  }

  // A section this document owns is replaced whole, present or not: an omitted
  // section is the author saying it holds nothing, not saying leave what is
  // there. Sections another document owns are untouched.
  if (owns(keys, "hardware")) {
    configuration.hardware = {};
    const cJSON* const hardware = member(root, "hardware");
    if (hardware != nullptr &&
        (!cJSON_IsArray(hardware) || cJSON_GetArraySize(hardware) != 0)) {
      (void)reject(failure, ValidationError::invalid_hardware, kName,
                   "hardware");
      return failure;
    }
  }

  if (owns(keys, "telemetry_transport")) {
    configuration.telemetry_transport = {};
    configuration.telemetry_transport_present = false;
    const cJSON* const transport = member(root, "telemetry_transport");
    if (transport != nullptr) {
      configuration.telemetry_transport_present = true;
      if (!parse_transport(transport, configuration.telemetry_transport,
                           failure)) {
        return failure;
      }
    }
  }

  if (owns(keys, "dashboard")) {
    configuration.dashboard = {};
    const cJSON* const dashboard = member(root, "dashboard");
    if (dashboard != nullptr &&
        !parse_dashboard(dashboard, configuration.dashboard, failure)) {
      return failure;
    }
  }
  return validate_configuration(configuration, profile);
}

[[nodiscard]] ValidationFailure parse_payload(
    const std::span<const std::uint8_t> input, const std::size_t limit,
    const KeyList keys, const ValidationContext& profile,
    ApplicationConfiguration& configuration) {
  ValidationFailure failure{};
  if (input.empty() || input.size() > limit) {
    (void)reject(failure, ValidationError::malformed, "configuration");
    return failure;
  }
  json::install_json_allocator();
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
  return parse_root(root.get(), keys, profile, configuration);
}

}  // namespace

// Callers provide dedicated scratch storage. The sections this document owns
// are reset and populated directly in it, so the multi-kilobyte runtime
// configuration is never duplicated on a task stack.
ValidationFailure parse_configuration_json(
    const ConfigurationDocument document,
    const std::span<const std::uint8_t> input,
    const ValidationContext& profile,
    ApplicationConfiguration& configuration) {
  return parse_payload(input,
                       configuration_document_payload_size(document),
                       schema::document_keys(document), profile,
                       configuration);
}

}  // namespace simcore::configuration
