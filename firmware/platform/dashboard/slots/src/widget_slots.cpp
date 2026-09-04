#include "widget_slots.hpp"

#include <optional>

#include "lvgl.h"
#include "value_conditions.hpp"

namespace simcore::dashboard::slots {
namespace {

constexpr std::uint32_t kEvaluationPeriodMs = LV_DEF_REFR_PERIOD;

}

Controller::~Controller() { clear(); }

bool Controller::add(lv_obj_t* const container,
                     const std::span<lv_obj_t* const> pages,
                     const configuration::SlotWidgetConfiguration& config,
                     const telemetry::ITelemetryRegistry& registry,
                     const telemetry::ITelemetryReader& telemetry,
                     const frame::ModifierReaders& modifier_readers) {
  const std::size_t page_count =
      config.page_count < pages.size() ? config.page_count : pages.size();
  if (container == nullptr || count_ >= slots_.size() || page_count == 0 ||
      page_count_ + page_count > pages_.size()) {
    return false;
  }

  Slot& slot = slots_[count_];
  slot = {};
  slot.container = container;
  slot.first_page = static_cast<std::uint8_t>(page_count_);
  slot.loop_page = kNoPage;

  for (std::size_t index = 0; index < page_count; ++index) {
    const configuration::SlotPageConfiguration& source = config.pages[index];
    if (pages[index] == nullptr) {
      return false;
    }
    Page& page = pages_[page_count_ + index];
    page = {};
    page.object = pages[index];
    page.in_loop = source.in_loop;
    page.trigger = source.trigger;
    page.duration_ms = source.duration_ms;
    page.condition_count = static_cast<std::uint8_t>(
        source.condition_count > source.conditions.size()
            ? source.conditions.size()
            : source.condition_count);
    for (std::size_t rule = 0; rule < page.condition_count; ++rule) {
      page.conditions[rule] = source.conditions[rule];
    }

    if (page.trigger != configuration::SlotTrigger::none) {
      bool fast_updates{};
      if (!frame::bind_source(
              configuration::value_binding_view(source.source.binding),
              source.source.modifier_count, source.source.modifiers, registry,
              telemetry, modifier_readers, nullptr, page.source, page.read,
              page.read_context, fast_updates)) {
        page = {};
        return false;
      }
    }
    if (page.in_loop && slot.loop_page == kNoPage) {
      slot.loop_page = static_cast<std::uint8_t>(page_count_ + index);
    }
  }

  if (slot.loop_page == kNoPage) {
    slot.loop_page = slot.first_page;
  }
  slot.page_count = static_cast<std::uint8_t>(page_count);
  page_count_ += page_count;
  ++count_;
  return true;
}

bool Controller::start() {
  bool watches_telemetry = false;
  for (std::size_t index = 0; index < count_; ++index) {
    lv_obj_add_flag(slots_[index].container, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(slots_[index].container, on_click, LV_EVENT_CLICKED,
                        this);
  }
  for (std::size_t index = 0; index < page_count_; ++index) {
    watches_telemetry = watches_telemetry || pages_[index].read != nullptr;
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
  for (std::size_t index = 0; index < count_; ++index) {
    lv_obj_t* const container = slots_[index].container;
    if (container == nullptr) {
      continue;
    }
    (void)lv_obj_remove_event_cb_with_user_data(container, on_click, this);
    lv_obj_remove_flag(container, LV_OBJ_FLAG_CLICKABLE);
  }
  count_ = 0;
  page_count_ = 0;
  slots_ = {};
  pages_ = {};
}

void Controller::evaluate(lv_timer_t* const timer) {
  auto* const controller =
      static_cast<Controller*>(lv_timer_get_user_data(timer));
  if (controller != nullptr) {
    controller->refresh();
  }
}

void Controller::on_click(lv_event_t* const event) {
  const lv_indev_t* const indev = lv_indev_active();
  if (indev != nullptr && lv_indev_get_gesture_dir(indev) != LV_DIR_NONE) {
    return;
  }
  auto* const controller =
      static_cast<Controller*>(lv_event_get_user_data(event));
  const lv_obj_t* const target = lv_event_get_current_target_obj(event);
  if (controller == nullptr || target == nullptr) {
    return;
  }
  for (std::size_t index = 0; index < controller->count_; ++index) {
    if (controller->slots_[index].container == target) {
      controller->advance(index);
      controller->refresh();
      return;
    }
  }
}

void Controller::advance(const std::size_t index) {
  Slot& slot = slots_[index];
  for (std::uint8_t offset = 0; offset < slot.page_count; ++offset) {
    if (pages_[slot.first_page + offset].event_active) {
      return;
    }
  }
  const std::uint8_t current =
      static_cast<std::uint8_t>(slot.loop_page - slot.first_page);
  for (std::uint8_t step = 1; step <= slot.page_count; ++step) {
    const auto offset =
        static_cast<std::uint8_t>((current + step) % slot.page_count);
    if (pages_[slot.first_page + offset].in_loop) {
      slot.loop_page = static_cast<std::uint8_t>(slot.first_page + offset);
      return;
    }
  }
}

bool Controller::raised(Page& page) {
  if (page.read == nullptr ||
      page.trigger == configuration::SlotTrigger::none) {
    return false;
  }
  const std::optional<double> value =
      conditions::condition_value(page.read(page.read_context));

  bool fires = false;
  if (value.has_value()) {
    if (page.trigger == configuration::SlotTrigger::value_changed) {
      fires = page.has_last && *value != page.last_value;
      page.last_value = *value;
      page.has_last = true;
    } else {
      for (std::size_t rule = 0; rule < page.condition_count; ++rule) {
        const configuration::ValueCondition& condition = page.conditions[rule];
        if (conditions::condition_holds(condition.op, *value,
                                        static_cast<double>(condition.value))) {
          fires = true;
          break;
        }
      }
    }
  } else if (page.trigger == configuration::SlotTrigger::value_changed) {
    page.has_last = false;
  }

  if (fires) {
    page.event_active = true;
    page.started = lv_tick_get();
    return true;
  }
  if (!page.event_active) {
    return false;
  }
  if (page.duration_ms == 0 || lv_tick_elaps(page.started) >= page.duration_ms) {
    page.event_active = false;
  }
  return page.event_active;
}

std::uint8_t Controller::selection(const Slot& slot) {
  std::uint8_t event = kNoPage;
  for (std::uint8_t offset = 0; offset < slot.page_count; ++offset) {
    const std::uint8_t index = static_cast<std::uint8_t>(slot.first_page + offset);
    if (raised(pages_[index]) && event == kNoPage) {
      event = index;
    }
  }
  return event != kNoPage ? event : slot.loop_page;
}

void Controller::refresh() {
  for (std::size_t index = 0; index < count_; ++index) {
    const Slot& slot = slots_[index];
    const std::uint8_t showing = selection(slot);
    for (std::uint8_t offset = 0; offset < slot.page_count; ++offset) {
      const std::uint8_t page = static_cast<std::uint8_t>(slot.first_page + offset);
      if (page == showing) {
        lv_obj_remove_flag(pages_[page].object, LV_OBJ_FLAG_HIDDEN);
      } else {
        lv_obj_add_flag(pages_[page].object, LV_OBJ_FLAG_HIDDEN);
      }
    }
  }
}

}
