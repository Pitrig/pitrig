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
// The claim also records which link owns the stream: an upload takes the link it
// was opened on, and any other link keeps parsing its own lines rather than
// having its telemetry swallowed by somebody else's upload. A product build
// runs one link, where that bookkeeping is trivially satisfied — the same code
// answers both cases rather than each having its own.

struct Session {
  /** The ASCII command namespace this session answers, e.g. `@SC:IMAGE:`. */
  std::string_view command_prefix;
  /** Handles one command line, without its terminator. Replies go to `reply`,
   *  which is the link the line arrived on — the only one, in a product
   *  build. */
  void (*consume_command)(void* context, std::span<const std::uint8_t> line,
                          transport::ITransport& reply);
  /** Handles raw bytes while this session owns the stream. */
  void (*consume)(void* context, std::span<const std::uint8_t> bytes);
  void* context{};
};

class Claim final {
 public:
  /** Whether the device has finished with the flash an upload would overwrite.
   *
   *  The serial link answers before startup has copied the font and image
   *  packages out of their partitions, so an upload that arrived in that window
   *  would erase what startup was still reading. Until the composition root
   *  says otherwise no session can take the stream, and a host asking for one
   *  is answered `busy` — which is what it is: the device is busy starting. */
  [[nodiscard]] bool ready() const {
    return ready_.load(std::memory_order_acquire);
  }

  /** Called once by the composition root, when nothing is reading those
   *  partitions any more. A recovery boot opens it as soon as the link is up:
   *  it loads no assets, so there is nothing for an upload to collide with. */
  void open() { ready_.store(true, std::memory_order_release); }

  /** Takes the stream for `session` on `link`, or fails because another
   *  session already has it — or because startup has not finished with the
   *  flash. `link` identifies one serial link; the reply transport serves,
   *  since there is exactly one per link. */
  [[nodiscard]] bool try_claim(const Session* session, const void* link) {
    const Session* expected = nullptr;
    if (session == nullptr || !ready() ||
        !owner_.compare_exchange_strong(expected, session,
                                        std::memory_order_acq_rel,
                                        std::memory_order_acquire)) {
      return false;
    }
    // Published after the exclusion is won, on the very task that reads the
    // claiming link. That task cannot observe its own stale value, and another
    // link seeing one only means it keeps parsing lines for an instant
    // longer — which is what it should be doing anyway.
    owner_link_.store(link, std::memory_order_release);
    return true;
  }

  /** Releases only if this session still holds it, so a late error cannot
   *  hand the stream away from whoever took it next. */
  void release(const Session* session) {
    const Session* expected = session;
    if (owner_.compare_exchange_strong(expected, nullptr,
                                       std::memory_order_acq_rel,
                                       std::memory_order_acquire)) {
      owner_link_.store(nullptr, std::memory_order_release);
    }
  }

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

 private:
  std::atomic<const Session*> owner_{nullptr};
  std::atomic<const void*> owner_link_{nullptr};
  // Closed until the composition root opens it. Startup is the one thing that
  // reads the asset partitions whole, and it now runs after the link answers.
  std::atomic<bool> ready_{false};
};

}  // namespace simcore::binary_session
