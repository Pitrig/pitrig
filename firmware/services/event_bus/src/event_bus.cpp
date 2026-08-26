#include "event_bus.hpp"

namespace simcore::events {

Subscription EventBus::subscribe(const EventId id, const Handler handler, void* const context) {
  if (handler == nullptr) {
    return {};
  }

  const std::lock_guard lock(mutex_);
  for (std::size_t index = 0; index < slots_.size(); ++index) {
    Slot& slot = slots_[index];
    if (slot.active) {
      continue;
    }

    ++slot.generation;
    if (slot.generation == 0) {
      ++slot.generation;
    }
    slot.id = id;
    slot.handler = handler;
    slot.context = context;
    slot.active = true;
    return {
        .slot = static_cast<std::uint8_t>(index),
        .generation = slot.generation,
        .valid = true,
    };
  }

  return {};
}

void EventBus::unsubscribe(const Subscription subscription) {
  if (!subscription.valid || subscription.slot >= slots_.size()) {
    return;
  }

  const std::lock_guard lock(mutex_);
  Slot& slot = slots_[subscription.slot];
  if (slot.active && slot.generation == subscription.generation) {
    slot.active = false;
    slot.handler = nullptr;
    slot.context = nullptr;
  }
}

void EventBus::publish(const Event& event) {
  struct Invocation {
    Handler handler{};
    void* context{};
  };
  std::array<Invocation, kMaximumSubscriptions> subscribers{};
  std::size_t subscriber_count = 0;

  {
    const std::lock_guard lock(mutex_);
    for (const Slot& slot : slots_) {
      if (slot.active && slot.id == event.id) {
        subscribers[subscriber_count++] = {
            .handler = slot.handler,
            .context = slot.context,
        };
      }
    }
  }

  for (std::size_t index = 0; index < subscriber_count; ++index) {
    const Invocation& subscriber = subscribers[index];
    subscriber.handler(event, subscriber.context);
  }
}

}
