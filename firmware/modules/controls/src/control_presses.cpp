#include <algorithm>

#include "control_plan.hpp"
#include "control_state.hpp"
#include "controls.hpp"
#include "led_control_events.hpp"

namespace pitrig::controls {
namespace {

constexpr std::uint32_t kButtonMask = (1U << kButtonCount) - 1U;

[[nodiscard]] std::uint8_t stepped(const std::uint8_t level, const int delta) {
  const int next = static_cast<int>(level) + delta * kLevelStep;
  return static_cast<std::uint8_t>(
      std::clamp(next, static_cast<int>(kLowestLevel), static_cast<int>(kHighestLevel)));
}

}

void Controls::follow_buttons(const std::uint64_t now_us) {
  const std::int64_t arrival = reader_->last_arrival_us();
  const bool stale =
      arrival <= 0 || now_us - static_cast<std::uint64_t>(arrival) > kStaleInputUs;
  const std::uint32_t buttons = stale ? 0U : read_unsigned(plan_->buttons) & kButtonMask;
  const std::uint32_t pressed = buttons & ~state_->held;
  const std::uint32_t released = state_->held & ~buttons;
  state_->held = buttons;
  if (buttons == 0 && released == 0) {
    return;
  }
  state_->activity_us = now_us;
  state_->home_sent = false;
  for (std::uint8_t button = 0; button < kButtonCount; ++button) {
    const std::uint32_t bit = 1U << button;
    const bool down = (pressed & bit) != 0;
    const bool up = (released & bit) != 0;
    const bool repeating =
        !down && (buttons & bit) != 0 && now_us >= state_->next_repeat_us[button];
    if (!down && !up && !repeating) {
      continue;
    }
    for (std::uint8_t index = 0; index < plan_->binding_count; ++index) {
      const Binding& binding = plan_->bindings[index];
      if (binding.button != button) {
        continue;
      }
      if (up) {
        release(binding);
      } else if (down) {
        press(binding, now_us, false);
      } else if (binding.repeat && repeats(binding.action)) {
        press(binding, now_us, true);
      }
    }
    if (down) {
      state_->next_repeat_us[button] = now_us + kRepeatDelayUs;
    } else if (repeating) {
      state_->next_repeat_us[button] = now_us + kRepeatIntervalUs;
    }
  }
}

void Controls::press(const Binding& binding, const std::uint64_t now_us, const bool repeated) {
  using configuration::ControlAction;
  const auto step = [&](const CommandKind kind, const std::int8_t delta) {
    post({.kind = kind, .delta = delta, .wrap = binding.wrap, .slot = binding.slot});
  };
  switch (binding.action) {
    case ControlAction::next_screen:
      return step(CommandKind::step_screen, 1);
    case ControlAction::previous_screen:
      return step(CommandKind::step_screen, -1);
    case ControlAction::next_page:
      return step(CommandKind::step_page, 1);
    case ControlAction::previous_page:
      return step(CommandKind::step_page, -1);
    case ControlAction::display_brighter:
      return step_display(1, now_us);
    case ControlAction::display_dimmer:
      return step_display(-1, now_us);
    case ControlAction::leds_brighter:
      return step_leds(1, false);
    case ControlAction::leds_dimmer:
      return step_leds(-1, false);
    default:
      break;
  }
  if (repeated) {
    return;
  }
  switch (binding.action) {
    case ControlAction::show_screen:
      show_screen(binding.screen);
      break;
    case ControlAction::hold_screen:
      if (state_->hold_screen == kNone) {
        state_->hold_return = active_screen();
      }
      state_->hold_screen = binding.screen;
      show_screen(binding.screen);
      break;
    case ControlAction::home_screen:
      show_screen(plan_->home_screen);
      break;
    case ControlAction::show_page:
      post({.kind = CommandKind::show_page, .slot = binding.slot, .page = binding.page});
      break;
    case ControlAction::hold_page:
      post({.kind = CommandKind::hold_page, .slot = binding.slot, .page = binding.page});
      break;
    case ControlAction::dismiss_page:
      post({.kind = CommandKind::dismiss_page, .slot = binding.slot});
      break;
    case ControlAction::leds_toggle:
      step_leds(0, true);
      break;
    default:
      break;
  }
}

void Controls::release(const Binding& binding) {
  if (binding.action == configuration::ControlAction::hold_page) {
    post({.kind = CommandKind::release_page, .slot = binding.slot});
    return;
  }
  if (binding.action != configuration::ControlAction::hold_screen ||
      state_->hold_screen != binding.screen) {
    return;
  }
  if (active_screen() == binding.screen) {
    show_screen(state_->hold_return);
  }
  state_->hold_screen = kNone;
  state_->hold_return = kNone;
}

void Controls::step_display(const int delta, const std::uint64_t now_us) {
  const std::uint8_t level = stepped(state_->display_percent, delta);
  if (level == state_->display_percent) {
    return;
  }
  state_->display_percent = level;
  if (dashboard_ != nullptr) {
    dashboard_->set_backlight(level);
  }
  state_->save_due_us = now_us + kSaveDelayUs;
}

void Controls::step_leds(const int delta, const bool toggle) {
  led_percent_ = stepped(led_percent_, delta);
  if (toggle) {
    leds_lit_ = !leds_lit_;
  }
  const events::LedControl control{.scale_percent = led_percent_, .lit = leds_lit_};
  event_bus_->publish(
      {.id = events::kLedControlEvent, .payload = &control, .payload_size = sizeof(control)});
}

}
