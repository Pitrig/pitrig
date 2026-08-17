#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

#include "simcore_features.hpp"

namespace simcore::transport {
class ITransport;
}

namespace simcore::binary_session {

// A serial link carries telemetry, the line-oriented control protocol, and —
// for the length of an upload — a binary stream. More than one asset kind can
// be uploaded, but only one of them may own the stream at a time, and that is
// what this exists to decide.
//
// The claim is taken synchronously on the task that reads the bytes, inside the
// handler for the command that opens a session, rather than by the worker task
// that does the erasing. That ordering is the whole point: a second BEGIN
// arriving while the first session is still starting up finds the stream
// already owned instead of finding a flag that has not been set yet.
//
// A development build may run more than one link, and then the claim also
// records which one owns the stream: an upload takes the link it was opened
// on, and the other link keeps parsing its own lines rather than having its
// telemetry swallowed by somebody else's upload.

struct Session {
  /** The ASCII command namespace this session answers, e.g. `@SC:IMAGE:`. */
  std::string_view command_prefix;
#if SIMCORE_SECOND_TELEMETRY_LINK
  /** Handles one command line, without its terminator. Replies go to `reply`,
   *  which is the link the line arrived on. */
  void (*consume_command)(void* context, std::span<const std::uint8_t> line,
                          transport::ITransport& reply);
#else
  /** Handles one command line, without its terminator. */
  void (*consume_command)(void* context, std::span<const std::uint8_t> line);
#endif
  /** Handles raw bytes while this session owns the stream. */
  void (*consume)(void* context, std::span<const std::uint8_t> bytes);
  void* context{};
};

class Claim final {
 public:
#if SIMCORE_SECOND_TELEMETRY_LINK
  /** Takes the stream for `session` on `link`, or fails because another
   *  session already has it. `link` identifies one serial link; the reply
   *  transport serves, since there is exactly one per link. */
  [[nodiscard]] bool try_claim(const Session* session, const void* link) {
    const Session* expected = nullptr;
    if (session == nullptr ||
        !owner_.compare_exchange_strong(expected, session,
                                        std::memory_order_acq_rel,
                                        std::memory_order_acquire)) {
      return false;
    }
    // Published after the exclusion is won, on the very task that reads the
    // claiming link. That task cannot observe its own stale value, and the
    // other link seeing one only means it keeps parsing lines for an instant
    // longer — which is what it should be doing anyway.
    owner_link_.store(link, std::memory_order_release);
    return true;
  }
#else
  /** Takes the stream, or fails because another session already has it. */
  [[nodiscard]] bool try_claim(const Session* session) {
    const Session* expected = nullptr;
    return session != nullptr &&
           owner_.compare_exchange_strong(expected, session,
                                          std::memory_order_acq_rel,
                                          std::memory_order_acquire);
  }
#endif

  /** Releases only if this session still holds it, so a late error cannot
   *  hand the stream away from whoever took it next. */
  void release(const Session* session) {
    const Session* expected = session;
    if (owner_.compare_exchange_strong(expected, nullptr,
                                       std::memory_order_acq_rel,
                                       std::memory_order_acquire)) {
#if SIMCORE_SECOND_TELEMETRY_LINK
      owner_link_.store(nullptr, std::memory_order_release);
#endif
    }
  }

  [[nodiscard]] const Session* owner() const {
    return owner_.load(std::memory_order_acquire);
  }

#if SIMCORE_SECOND_TELEMETRY_LINK
  /** The session owning the stream on `link`, or null when `link` is not the
   *  one an upload was opened on. */
  [[nodiscard]] const Session* owner_on(const void* link) const {
    const Session* const session = owner_.load(std::memory_order_acquire);
    if (session == nullptr ||
        owner_link_.load(std::memory_order_acquire) != link) {
      return nullptr;
    }
    return session;
  }
#endif

 private:
  std::atomic<const Session*> owner_{nullptr};
#if SIMCORE_SECOND_TELEMETRY_LINK
  std::atomic<const void*> owner_link_{nullptr};
#endif
};

}  // namespace simcore::binary_session
