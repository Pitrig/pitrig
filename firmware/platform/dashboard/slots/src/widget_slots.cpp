#include "widget_slots.hpp"

#include <optional>

#include "lvgl.h"
#include "widget_conditions.hpp"

namespace simcore::dashboard::slots {
namespace {

constexpr std::uint32_t kEvaluationPeriodMs = LV_DEF_REFR_PERIOD;

}  // namespace

Controller::~Controller() { clear(); }

bool Controller::add(lv_obj_t* const container,
                     const configuration::GroupConfiguration& group,
                     const telemetry::ITelemetryRegistry& registry,
                     const telemetry::ITelemetryReader& telemetry,
                     const frame::ModifierReader lap_timer_modifier) {
  if (container == nullptr || count_ >= members_.size()) {
    return false;
  }
  Member& member = members_[count_];
  member = {};
  member.container = container;
  member.slot = group.slot;
  member.is_default = group.slot_default;
  member.condition_count =
      static_cast<std::uint8_t>(group.condition_count > group.conditions.size()
                                    ? group.conditions.size()
                                    : group.condition_count);
  // Copied for the reason a widget copies its rules: applying a configuration
  // can swap the document out from under a group that did not itself change.
  for (std::size_t index = 0; index < member.condition_count; ++index) {
    member.conditions[index] = group.conditions[index];
  }

  if (member.condition_count > 0) {
    bool fast_updates{};
    if (!frame::bind_source(
            configuration::value_binding_view(group.condition_source.binding),
            group.condition_source.modifier_count,
            group.condition_source.modifiers, registry, telemetry,
            lap_timer_modifier, member.source, member.read,
            member.read_context, fast_updates)) {
      member = {};
      return false;
    }
  }
  ++count_;
  return true;
}

bool Controller::start() {
  manual_.fill(kNoMember);
  bool watches_telemetry = false;
  for (std::size_t index = 0; index < count_; ++index) {
    Member& member = members_[index];
    if (member.slot == 0) {
      continue;
    }
    // The only clickable object in the dashboard. Widgets all refuse clicks, so
    // a tap on any of a group's children reaches its container.
    lv_obj_add_flag(member.container, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(member.container, on_click, LV_EVENT_CLICKED, this);
    watches_telemetry = watches_telemetry || member.read != nullptr;
  }
  refresh();
  if (!watches_telemetry) {
    return true;
  }
  timer_ = lv_timer_create(evaluate, kEvaluationPeriodMs, this);
  return timer_ != nullptr;
}

void Controller::clear() {
  if (timer_ != nullptr) {
    lv_timer_delete(timer_);
    timer_ = nullptr;
  }
  // The containers are deleted with their screens, which takes their event
  // callbacks with them; forgetting them here is all this owns.
  count_ = 0;
  members_ = {};
}

void Controller::evaluate(lv_timer_t* const timer) {
  auto* const controller =
      static_cast<Controller*>(lv_timer_get_user_data(timer));
  if (controller != nullptr) {
    controller->refresh();
  }
}

void Controller::on_click(lv_event_t* const event) {
  auto* const controller =
      static_cast<Controller*>(lv_event_get_user_data(event));
  const lv_obj_t* const target = lv_event_get_current_target_obj(event);
  if (controller == nullptr || target == nullptr) {
    return;
  }
  for (std::size_t index = 0; index < controller->count_; ++index) {
    const Member& member = controller->members_[index];
    if (member.container == target && member.slot != 0) {
      controller->advance(member.slot);
      controller->refresh();
      return;
    }
  }
}

void Controller::advance(const std::uint8_t slot) {
  const std::uint8_t showing = selection(slot);
  bool passed = showing == kNoMember;
  std::uint8_t first = kNoMember;
  std::uint8_t next = kNoMember;
  for (std::size_t index = 0; index < count_; ++index) {
    if (members_[index].slot != slot) {
      continue;
    }
    const auto candidate = static_cast<std::uint8_t>(index);
    if (first == kNoMember) {
      first = candidate;
    }
    if (passed) {
      next = candidate;
      break;
    }
    passed = candidate == showing;
  }
  // Wrapping: past the last member the slot starts again at the first.
  manual_[slot - 1] = next != kNoMember ? next : first;
}

std::uint8_t Controller::selection(const std::uint8_t slot) {
  const std::uint32_t now = lv_tick_get();
  std::uint8_t matched = kNoMember;
  std::uint8_t authored = kNoMember;
  std::uint8_t first = kNoMember;
  for (std::size_t index = 0; index < count_; ++index) {
    Member& member = members_[index];
    if (member.slot != slot) {
      continue;
    }
    if (first == kNoMember) {
      first = static_cast<std::uint8_t>(index);
    }
    if (member.is_default) {
      authored = static_cast<std::uint8_t>(index);
    }
    if (member.read == nullptr || member.condition_count == 0) {
      continue;
    }
    // The same comparison a styling rule makes, deciding which group of the
    // slot is shown rather than how a widget is painted. Declaration order
    // decides, exactly as it does among one widget's rules.
    const std::optional<double> value =
        conditions::condition_value(member.read(member.read_context));
    bool holds = false;
    std::uint16_t hold_ms = 0;
    if (value.has_value()) {
      for (std::size_t rule = 0; rule < member.condition_count; ++rule) {
        const configuration::GroupCondition& condition = member.conditions[rule];
        if (conditions::condition_holds(condition.op, *value,
                                        static_cast<double>(condition.value))) {
          holds = true;
          hold_ms = condition.hold_ms;
          break;
        }
      }
    }
    if (holds) {
      member.held = hold_ms > 0;
      member.hold_until_ms = now + hold_ms;
    } else if (member.held && now >= member.hold_until_ms) {
      member.held = false;
    }
    if ((holds || member.held) && matched == kNoMember) {
      matched = static_cast<std::uint8_t>(index);
    }
  }
  if (matched != kNoMember) {
    return matched;
  }
  if (const std::uint8_t chosen = manual_[slot - 1]; chosen != kNoMember) {
    return chosen;
  }
  // Validation guarantees a default per populated slot; falling back to the
  // first member keeps a hand-built document from showing an empty box.
  return authored != kNoMember ? authored : first;
}

void Controller::refresh() {
  std::array<std::uint8_t, configuration::kMaximumSlots> showing{};
  for (std::uint8_t slot = 1; slot <= configuration::kMaximumSlots; ++slot) {
    showing[slot - 1] = selection(slot);
  }
  for (std::size_t index = 0; index < count_; ++index) {
    const Member& member = members_[index];
    if (member.slot == 0) {
      continue;
    }
    const bool visible = showing[member.slot - 1] == index;
    if (visible) {
      lv_obj_remove_flag(member.container, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(member.container, LV_OBJ_FLAG_HIDDEN);
    }
  }
}

}  // namespace simcore::dashboard::slots
