#include "lvgl.h"
#include "widget_slots.hpp"

namespace pitrig::dashboard::slots {

void Controller::step(const std::size_t index, const int delta, const bool wrap) {
  Slot* const slot = find(index);
  if (slot == nullptr || slot->page_count == 0) {
    return;
  }
  slot->touched = lv_tick_get();
  if (event_active(*slot)) {
    return;
  }
  const int count = slot->page_count;
  const int current = slot->loop_page - slot->first_page;
  for (int distance = 1; distance < count; ++distance) {
    int offset = current + (delta > 0 ? distance : -distance);
    if (!wrap && (offset < 0 || offset >= count)) {
      return;
    }
    offset = ((offset % count) + count) % count;
    if (pages_[slot->first_page + offset].in_loop) {
      slot->loop_page = static_cast<std::uint8_t>(slot->first_page + offset);
      break;
    }
  }
  refresh(false);
}

void Controller::show(const std::size_t index, const std::uint8_t page) {
  Slot* const slot = find(index);
  if (slot == nullptr || page >= slot->page_count) {
    return;
  }
  slot->touched = lv_tick_get();
  slot->loop_page = static_cast<std::uint8_t>(slot->first_page + page);
  refresh(false);
}

void Controller::hold(const std::size_t index, const std::uint8_t page) {
  Slot* const slot = find(index);
  if (slot == nullptr || page >= slot->page_count) {
    return;
  }
  slot->touched = lv_tick_get();
  slot->held_page = static_cast<std::uint8_t>(slot->first_page + page);
  refresh(false);
}

void Controller::release(const std::size_t index) {
  Slot* const slot = find(index);
  if (slot == nullptr) {
    return;
  }
  slot->touched = lv_tick_get();
  slot->held_page = kNoPage;
  refresh(false);
}

void Controller::dismiss(const std::size_t index) {
  Slot* const slot = find(index);
  if (slot == nullptr) {
    return;
  }
  for (std::uint8_t offset = 0; offset < slot->page_count; ++offset) {
    Page& page = pages_[slot->first_page + offset];
    if (page.event_active) {
      page.event_active = false;
      page.dismissed = true;
      page.rearmed = false;
      page.dismissed_at = lv_tick_get();
      break;
    }
  }
  refresh(false);
}

void Controller::new_session() {
  for (std::size_t index = 0; index < page_count_; ++index) {
    Page& page = pages_[index];
    if (page.dismissed && page.dismiss == configuration::SlotDismiss::session) {
      page.dismissed = false;
    }
  }
  refresh(false);
}

bool Controller::dismissal_holds(Page& page, const bool fires) {
  switch (page.dismiss) {
    case configuration::SlotDismiss::timed:
      if (lv_tick_elaps(page.dismissed_at) < page.dismiss_ms) {
        return true;
      }
      break;
    case configuration::SlotDismiss::next_event:
      if (!fires) {
        page.rearmed = true;
        return true;
      }
      if (page.trigger != configuration::SlotTrigger::value_changed && !page.rearmed) {
        return true;
      }
      break;
    case configuration::SlotDismiss::session:
      return true;
  }
  page.dismissed = false;
  return false;
}

Controller::Slot* Controller::find(const std::size_t index) {
  for (std::size_t slot = 0; slot < count_; ++slot) {
    if (slots_[slot].index == index) {
      return &slots_[slot];
    }
  }
  return nullptr;
}

bool Controller::event_active(const Slot& slot) const {
  for (std::uint8_t offset = 0; offset < slot.page_count; ++offset) {
    if (pages_[slot.first_page + offset].event_active) {
      return true;
    }
  }
  return false;
}

void Controller::return_home() {
  for (std::size_t index = 0; index < count_; ++index) {
    Slot& slot = slots_[index];
    if (slot.home_after_ms != 0 && slot.held_page == kNoPage && slot.loop_page != slot.home_page &&
        lv_tick_elaps(slot.touched) >= slot.home_after_ms) {
      slot.loop_page = slot.home_page;
    }
  }
}

}
