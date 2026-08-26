#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

namespace simcore::transport {
class ITransport;
}

namespace simcore::binary_session {

struct Session {
  std::string_view command_prefix;
  void (*consume_command)(void* context, std::span<const std::uint8_t> line,
                          transport::ITransport& reply);
  void (*consume)(void* context, std::span<const std::uint8_t> bytes);
  void* context{};
};

class Claim final {
 public:
  [[nodiscard]] bool ready() const {
    return ready_.load(std::memory_order_acquire);
  }

  void open() { ready_.store(true, std::memory_order_release); }

  [[nodiscard]] bool try_claim(const Session* session, const void* link) {
    const Session* expected = nullptr;
    if (session == nullptr || !ready() ||
        !owner_.compare_exchange_strong(expected, session,
                                        std::memory_order_acq_rel,
                                        std::memory_order_acquire)) {
      return false;
    }
    owner_link_.store(link, std::memory_order_release);
    return true;
  }

  void release(const Session* session) {
    const Session* expected = session;
    if (owner_.compare_exchange_strong(expected, nullptr,
                                       std::memory_order_acq_rel,
                                       std::memory_order_acquire)) {
      owner_link_.store(nullptr, std::memory_order_release);
    }
  }

  [[nodiscard]] const Session* owner_on(const void* link) const {
    const Session* const session = owner_.load(std::memory_order_acquire);
    if (session == nullptr ||
        owner_link_.load(std::memory_order_acquire) != link) {
      return nullptr;
    }
    return session;
  }

 private:
  std::atomic<const Session*> owner_{nullptr};
  std::atomic<const void*> owner_link_{nullptr};
  std::atomic<bool> ready_{false};
};

}
