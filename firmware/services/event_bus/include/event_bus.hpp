#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <mutex>

namespace simcore::events {

using EventId = std::uint32_t;

struct Event {
  EventId id{};
  const void* payload{};
  std::size_t payload_size{};
};

using Handler = void (*)(const Event& event, void* context);

struct Subscription {
  std::uint8_t slot{};
  std::uint32_t generation{};
  bool valid{};
};

// Delivers events synchronously to a fixed number of subscribers.
//
// Event payloads remain valid only for the duration of publish(). Subscribers
// must copy any data they need after the callback returns.
class EventBus {
 public:
  static constexpr std::size_t kMaximumSubscriptions = 16;

  [[nodiscard]] Subscription subscribe(EventId id, Handler handler, void* context);
  void unsubscribe(Subscription subscription);
  void publish(const Event& event);

 private:
  struct Slot {
    EventId id{};
    Handler handler{};
    void* context{};
    std::uint32_t generation{};
    bool active{};
  };

  std::array<Slot, kMaximumSubscriptions> slots_{};
  std::mutex mutex_;
};

}  // namespace simcore::events
