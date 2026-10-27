#include <optional>

#include "control_plan.hpp"
#include "control_state.hpp"
#include "controls.hpp"
#include "logger.hpp"
#include "value_conditions.hpp"

namespace pitrig::controls {

void Controls::follow_switch() {
  const std::uint32_t position = read_unsigned(plan_->position);
  if (position == state_->position) {
    return;
  }
  state_->position = position;
  if (position == 0 || plan_->switch_slot == kNone ||
      position > configuration::kMaximumSlotPages) {
    return;
  }
  post({.kind = CommandKind::show_page,
        .slot = plan_->switch_slot,
        .page = static_cast<std::uint8_t>(position - 1U)});
}

void Controls::follow_rules() {
  if (plan_->rule_count == 0) {
    return;
  }
  std::uint8_t wanted = kNone;
  for (std::uint8_t index = 0; index < plan_->rule_count && wanted == kNone; ++index) {
    const Rule& rule = plan_->rules[index];
    const std::optional<double> value = conditions::condition_value(reader_->read(rule.source));
    if (!value.has_value()) {
      continue;
    }
    for (std::uint8_t condition = 0; condition < rule.condition_count; ++condition) {
      if (conditions::condition_holds(rule.conditions[condition].op, *value,
                                      rule.conditions[condition].value)) {
        wanted = rule.screen;
        break;
      }
    }
  }
  if (wanted == state_->rule_screen) {
    return;
  }
  if (wanted != kNone) {
    if (state_->rule_screen == kNone) {
      state_->rule_return = active_screen();
    }
    state_->rule_screen = wanted;
    show_screen(wanted);
    return;
  }
  if (active_screen() == state_->rule_screen) {
    show_screen(state_->rule_return);
  }
  state_->rule_screen = kNone;
  state_->rule_return = kNone;
}

void Controls::return_home(const std::uint64_t now_us) {
  if (plan_->home_after_ms == 0 || dashboard_ == nullptr) {
    return;
  }
  const std::uint8_t active = active_screen();
  if (active != state_->seen_screen) {
    state_->seen_screen = active;
    state_->activity_us = now_us;
    state_->home_sent = false;
  }
  if (active == plan_->home_screen || state_->home_sent || state_->rule_screen != kNone ||
      state_->hold_screen != kNone || state_->held != 0) {
    return;
  }
  if (now_us - state_->activity_us >= static_cast<std::uint64_t>(plan_->home_after_ms) * 1000U) {
    show_screen(plan_->home_screen);
    state_->home_sent = true;
  }
}

void Controls::follow_session() {
  if (!plan_->session_dismissals || !plan_->elapsed.valid()) {
    return;
  }
  const telemetry::TelemetryRead read = reader_->read(plan_->elapsed);
  if (!read.available || read.handle.type != telemetry::ValueType::uint32) {
    return;
  }
  const std::uint32_t elapsed = read.value.typed.uint32_value;
  if (state_->has_elapsed && elapsed + kSessionRewindMs < state_->elapsed_ms) {
    post({.kind = CommandKind::new_session});
  }
  state_->elapsed_ms = elapsed;
  state_->has_elapsed = true;
}

void Controls::store_brightness(const std::uint64_t now_us, const bool force) {
  if (state_->save_due_us == 0 || (!force && now_us < state_->save_due_us)) {
    return;
  }
  state_->save_due_us = 0;
  if (!settings_->save_settings({.display_brightness = state_->display_percent})) {
    log::warn(kTag, "Display brightness could not be stored");
  }
}

}
