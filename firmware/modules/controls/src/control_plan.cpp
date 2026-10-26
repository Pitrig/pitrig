#include "control_plan.hpp"

#include <string_view>

namespace pitrig::controls {
namespace {

constexpr std::string_view kButtonsField = "input.buttons";
constexpr std::string_view kPositionField = "input.switch";
constexpr std::string_view kElapsedField = "session.time_elapsed";

[[nodiscard]] std::uint8_t screen_of(const configuration::DashboardConfiguration& dashboard,
                                     const std::string_view id) {
  for (std::size_t index = 0; index < dashboard.screen_count; ++index) {
    if (configuration::text_view(dashboard.screens[index].id) == id) {
      return static_cast<std::uint8_t>(index);
    }
  }
  return kNone;
}

[[nodiscard]] std::uint8_t slot_of(const configuration::DashboardConfiguration& dashboard,
                                   const std::string_view id) {
  for (std::size_t index = 0; index < dashboard.slot_widget_count; ++index) {
    if (configuration::text_view(dashboard.slot_widgets[index].frame.id) == id) {
      return static_cast<std::uint8_t>(index);
    }
  }
  return kNone;
}

[[nodiscard]] bool dismisses_for_session(const configuration::DashboardConfiguration& dashboard) {
  for (std::size_t index = 0; index < dashboard.slot_widget_count; ++index) {
    const configuration::SlotWidgetConfiguration& slot = dashboard.slot_widgets[index];
    for (std::size_t page = 0; page < slot.page_count; ++page) {
      if (slot.pages[page].dismiss == configuration::SlotDismiss::session) {
        return true;
      }
    }
  }
  return false;
}

}

bool controls_used(const configuration::DashboardConfiguration& dashboard) {
  const configuration::ControlsConfiguration& controls = dashboard.controls;
  return controls.binding_count > 0 || controls.rule_count > 0 || controls.home_after_ms > 0 ||
         !configuration::text_view(controls.position_switch.slot).empty();
}

void build_plan(const configuration::DashboardConfiguration& dashboard,
                const telemetry::ITelemetryRegistry& registry, Plan& plan) {
  const configuration::ControlsConfiguration& controls = dashboard.controls;
  plan = {};
  for (std::size_t index = 0; index < controls.binding_count; ++index) {
    const configuration::ControlBinding& source = controls.bindings[index];
    Binding& binding = plan.bindings[plan.binding_count++];
    binding = {
        .action = source.action,
        .button = static_cast<std::uint8_t>(source.button - 1U),
        .screen = screen_of(dashboard, configuration::text_view(source.screen)),
        .slot = slot_of(dashboard, configuration::text_view(source.slot)),
        .page = static_cast<std::uint8_t>(source.page - 1U),
        .wrap = source.wrap,
        .repeat = source.repeat,
    };
  }
  for (std::size_t index = 0; index < controls.rule_count; ++index) {
    const configuration::ControlRule& source = controls.rules[index];
    Rule& rule = plan.rules[plan.rule_count++];
    rule.screen = screen_of(dashboard, configuration::text_view(source.screen));
    rule.source = registry.resolve(configuration::value_binding_view(source.source.binding));
    rule.condition_count = source.condition_count;
    for (std::size_t condition = 0; condition < source.condition_count; ++condition) {
      rule.conditions[condition] = source.conditions[condition];
    }
  }
  plan.switch_slot = slot_of(dashboard, configuration::text_view(controls.position_switch.slot));
  const std::uint8_t home = screen_of(dashboard, configuration::text_view(controls.home_screen));
  plan.home_screen = home == kNone ? 0 : home;
  plan.home_after_ms = controls.home_after_ms;
  plan.session_dismissals = dismisses_for_session(dashboard);
  plan.buttons = registry.resolve(kButtonsField);
  plan.position = registry.resolve(kPositionField);
  plan.elapsed = registry.resolve(kElapsedField);
}

bool repeats(const configuration::ControlAction action) {
  switch (action) {
    case configuration::ControlAction::next_screen:
    case configuration::ControlAction::previous_screen:
    case configuration::ControlAction::next_page:
    case configuration::ControlAction::previous_page:
    case configuration::ControlAction::display_brighter:
    case configuration::ControlAction::display_dimmer:
    case configuration::ControlAction::leds_brighter:
    case configuration::ControlAction::leds_dimmer:
      return true;
    default:
      return false;
  }
}

}
