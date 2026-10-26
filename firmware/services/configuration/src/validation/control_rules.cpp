#include "validation/control_rules.hpp"

#include <cmath>
#include <cstddef>
#include <cstdint>
#include <string_view>

#include "telemetry_registry.hpp"
#include "validation/value_rules.hpp"
#include "validation_failure.hpp"

namespace pitrig::configuration::validation {
namespace {

constexpr std::size_t kAbsent = SIZE_MAX;

[[nodiscard]] std::size_t screen_of(const DashboardConfiguration& dashboard,
                                    const std::string_view id) {
  for (std::size_t index = 0; index < dashboard.screen_count; ++index) {
    if (text_view(dashboard.screens[index].id) == id) {
      return index;
    }
  }
  return kAbsent;
}

[[nodiscard]] std::size_t slot_of(const DashboardConfiguration& dashboard,
                                  const std::string_view id) {
  for (std::size_t index = 0; index < dashboard.slot_widget_count; ++index) {
    if (text_view(dashboard.slot_widgets[index].frame.id) == id) {
      return index;
    }
  }
  return kAbsent;
}

[[nodiscard]] bool names_screen(const ControlAction action) {
  return action == ControlAction::show_screen || action == ControlAction::hold_screen;
}

[[nodiscard]] bool names_slot(const ControlAction action) {
  switch (action) {
    case ControlAction::next_page:
    case ControlAction::previous_page:
    case ControlAction::show_page:
    case ControlAction::hold_page:
    case ControlAction::dismiss_page:
      return true;
    default:
      return false;
  }
}

[[nodiscard]] bool names_page(const ControlAction action) {
  return action == ControlAction::show_page || action == ControlAction::hold_page;
}

[[nodiscard]] bool binding_valid(const DashboardConfiguration& dashboard,
                                 const ControlBinding& binding) {
  if (!schema::range_error(binding).empty() || !terminated(binding.screen) ||
      !terminated(binding.slot) || binding.action > ControlAction::leds_toggle) {
    return false;
  }
  const std::string_view screen = text_view(binding.screen);
  const std::string_view slot = text_view(binding.slot);
  if (names_screen(binding.action) ? screen_of(dashboard, screen) == kAbsent : !screen.empty()) {
    return false;
  }
  if (!names_slot(binding.action)) {
    return slot.empty();
  }
  const std::size_t index = slot_of(dashboard, slot);
  return index != kAbsent && (!names_page(binding.action) ||
                              binding.page <= dashboard.slot_widgets[index].page_count);
}

[[nodiscard]] bool rule_valid(const DashboardConfiguration& dashboard, const ControlRule& rule,
                              const telemetry::TelemetryRegistry& registry) {
  if (!terminated(rule.screen) || screen_of(dashboard, text_view(rule.screen)) == kAbsent ||
      rule.condition_count == 0 || rule.condition_count > rule.conditions.size() ||
      rule.source.modifier_count != 0 ||
      !registry.resolve(value_binding_view(rule.source.binding)).valid()) {
    return false;
  }
  for (std::size_t index = 0; index < rule.condition_count; ++index) {
    const ValueCondition& condition = rule.conditions[index];
    if (!std::isfinite(condition.value) || condition.op > ConditionOperator::bit_set) {
      return false;
    }
  }
  return true;
}

}

bool validate_controls(const DashboardConfiguration& dashboard, ValidationFailure& failure) {
  const ControlsConfiguration& controls = dashboard.controls;
  if (controls.binding_count > controls.bindings.size() ||
      controls.rule_count > controls.rules.size() || !terminated(controls.home_screen) ||
      !terminated(controls.position_switch.slot)) {
    return reject(failure, ValidationError::invalid_control, "dashboard.controls");
  }
  if (const std::string_view out_of_range = schema::range_error(controls);
      !out_of_range.empty()) {
    return reject(failure, ValidationError::invalid_control, out_of_range);
  }
  for (std::size_t index = 0; index < controls.binding_count; ++index) {
    if (!binding_valid(dashboard, controls.bindings[index])) {
      return reject(failure, ValidationError::invalid_control, "dashboard.controls.bindings");
    }
  }
  const std::string_view switched = text_view(controls.position_switch.slot);
  if (!switched.empty() && slot_of(dashboard, switched) == kAbsent) {
    return reject(failure, ValidationError::invalid_control, "dashboard.controls.switch");
  }
  const std::string_view home = text_view(controls.home_screen);
  if (!home.empty() && screen_of(dashboard, home) == kAbsent) {
    return reject(failure, ValidationError::invalid_control, "dashboard.controls.home_screen");
  }
  const telemetry::TelemetryRegistry registry{};
  for (std::size_t index = 0; index < controls.rule_count; ++index) {
    if (!rule_valid(dashboard, controls.rules[index], registry)) {
      return reject(failure, ValidationError::invalid_control, "dashboard.controls.rules");
    }
  }
  return true;
}

}
