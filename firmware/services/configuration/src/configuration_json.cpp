#include "configuration_json.hpp"

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
    if (!parse_widget(cJSON_GetArrayItem(widgets, index), dashboard,
                      ReferenceTable{group.widgets, &group.widget_count},
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
    if (!parse_widget(cJSON_GetArrayItem(widgets, index), dashboard,
                      ReferenceTable{screen.widgets, &screen.widget_count},
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

  // Callers provide dedicated scratch storage. Reset and populate it directly
  // so the multi-kilobyte runtime configuration is never duplicated on a task
  // stack.
  configuration = {};
  return parse_root(root.get(), profile, configuration);
}

}  // namespace simcore::configuration
