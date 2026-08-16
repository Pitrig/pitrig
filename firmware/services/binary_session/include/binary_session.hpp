#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

namespace simcore::binary_session {

// One serial link carries telemetry, the line-oriented control protocol, and —
// for the length of an upload — a binary stream. More than one asset kind can
// be uploaded, but only one of them may own the stream at a time, and that is
// what this exists to decide.
//
// The claim is taken synchronously on the task that reads the bytes, inside the
// handler for the command that opens a session, rather than by the worker task
// that does the erasing. That ordering is the whole point: a second BEGIN
// arriving while the first session is still starting up finds the stream
// already owned instead of finding a flag that has not been set yet.

struct Session {
  /** The ASCII command namespace this session answers, e.g. `@SC:IMAGE:`. */
  std::string_view command_prefix;
  /** Handles one command line, without its terminator. */
  void (*consume_command)(void* context, std::span<const std::uint8_t> line);
  /** Handles raw bytes while this session owns the stream. */
  void (*consume)(void* context, std::span<const std::uint8_t> bytes);
  void* context{};
};

class Claim final {
 public:
  /** Takes the stream, or fails because another session already has it. */
  [[nodiscard]] bool try_claim(const Session* session) {
    const Session* expected = nullptr;
    return session != nullptr &&
           owner_.compare_exchange_strong(expected, session,
                                          std::memory_order_acq_rel,
                                          std::memory_order_acquire);
  }

  /** Releases only if this session still holds it, so a late error cannot
   *  hand the stream away from whoever took it next. */
  void release(const Session* session) {
    const Session* expected = session;
    (void)owner_.compare_exchange_strong(expected, nullptr,
                                         std::memory_order_acq_rel,
                                         std::memory_order_acquire);
  }

  [[nodiscard]] const Session* owner() const {
    return owner_.load(std::memory_order_acquire);
  }

 private:
  std::atomic<const Session*> owner_{nullptr};
};

}  // namespace simcore::binary_session
