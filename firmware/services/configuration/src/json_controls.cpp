#include "json_controls.hpp"

#include <string_view>

#include "configuration_schema_generated.hpp"
#include "json_readers.hpp"
#include "json_value_pipeline.hpp"

namespace pitrig::configuration::json {
namespace {

[[nodiscard]] bool parse_binding(const cJSON* const object, ControlBinding& binding,
                                 ValidationFailure& failure) {
  constexpr std::string_view kName = "dashboard.controls.bindings";
  return valid_object(object, schema::kControlBindingKeys, kName, failure) &&
         read_integer(object, "button", binding.button, kName, failure) &&
         read_enum(object, "action", binding.action, control_action_from_name, kName, failure) &&
         read_text(object, "screen", binding.screen, kName, failure) &&
         read_text(object, "slot", binding.slot, kName, failure) &&
         read_integer(object, "page", binding.page, kName, failure) &&
         read_boolean(object, "wrap", binding.wrap, kName, failure) &&
         read_boolean(object, "repeat", binding.repeat, kName, failure);
}

[[nodiscard]] bool parse_rule(const cJSON* const object, ControlRule& rule,
                              ValidationFailure& failure) {
  constexpr std::string_view kName = "dashboard.controls.rules";
  if (!valid_object(object, schema::kControlRuleKeys, kName, failure) ||
      !read_text(object, "screen", rule.screen, kName, failure) ||
      !parse_value_source(object, "source", rule.source, "dashboard.controls.rules.source",
                          failure)) {
    return false;
  }
  return read_array(object, "conditions", rule.conditions, rule.condition_count, kName,
                    ValidationError::out_of_range, failure,
                    [&](const cJSON* const condition, ValueCondition& parsed) {
                      return read_value_condition(condition, parsed, kName, failure);
                    });
}

[[nodiscard]] bool parse_switch(const cJSON* const object, ControlSwitch& control,
                                ValidationFailure& failure) {
  constexpr std::string_view kName = "dashboard.controls.switch";
  return object == nullptr ||
         (valid_object(object, schema::kControlSwitchKeys, kName, failure) &&
          read_text(object, "slot", control.slot, kName, failure));
}

}

bool parse_controls(const cJSON* const object, ControlsConfiguration& controls,
                    ValidationFailure& failure) {
  constexpr std::string_view kName = "dashboard.controls";
  if (!valid_object(object, schema::kControlsConfigurationKeys, kName, failure) ||
      !read_text(object, "home_screen", controls.home_screen, kName, failure) ||
      !read_integer(object, "home_after_ms", controls.home_after_ms, kName, failure) ||
      !parse_switch(member(object, "switch"), controls.position_switch, failure)) {
    return false;
  }
  return read_array(object, "bindings", controls.bindings, controls.binding_count, kName,
                    ValidationError::invalid_control, failure,
                    [&](const cJSON* const binding, ControlBinding& parsed) {
                      return parse_binding(binding, parsed, failure);
                    },
                    "bindings") &&
         read_array(object, "rules", controls.rules, controls.rule_count, kName,
                    ValidationError::invalid_control, failure,
                    [&](const cJSON* const rule, ControlRule& parsed) {
                      return parse_rule(rule, parsed, failure);
                    },
                    "rules");
}

}
