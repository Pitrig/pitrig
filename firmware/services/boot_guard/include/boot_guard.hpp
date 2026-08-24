#pragma once

#include <cstdint>
#include <string_view>

// Whether this boot may run the whole firmware, and what the previous one was
// doing when it stopped.
//
// A crashed task on this chip is a panic that takes the device with it; there
// is no isolating one task from the rest. The only place a fault can be
// contained is therefore the boot after it. The counter below survives the
// reset the crash caused, and once enough of them accumulate the composition
// root brings up the serial link alone and stops there, so a board that cannot
// run its dashboard can still be reached and repaired.
namespace simcore::boot_guard {

// Which phase of startup is running. Written as each phase is *entered*, so a
// boot that does not survive one leaves the name of the phase that killed it
// rather than the name of the last one that worked. `complete` means startup
// finished and whatever happened, happened afterwards.
enum class Phase : std::uint8_t {
  none,
  configuration,
  link,
  display,
  assets,
  composition,
  complete,
};

// Why this boot happened, reduced to what a host can act on. Anything that is
// neither a fault nor a deliberate restart lands in `other`.
enum class ResetCause : std::uint8_t {
  power_on,
  software,
  panic,
  task_watchdog,
  brownout,
  other,
};

struct Status {
  // This boot runs the recovery surface: the link and the control protocol,
  // and nothing that could fail the same way again.
  bool safe_mode{};
  std::uint8_t consecutive_failures{};
  ResetCause cause{};
  // The phase the *previous* boot was in when it stopped, which is the one that
  // says what failed. This boot's own progress is written over the stored value
  // as it goes, and is not reported.
  Phase phase{};
};

// The spellings `@SC:INFO` uses.
[[nodiscard]] std::string_view phase_name(Phase phase);
[[nodiscard]] std::string_view reset_cause_name(ResetCause cause);

// Classifies the reset, counts a fault against the previous boot, and decides
// whether this one is a recovery boot. Called once, before anything else.
void begin();

[[nodiscard]] const Status& status();
[[nodiscard]] bool safe_mode();

// Records that startup has entered `phase`. One byte into RTC memory: it never
// blocks, never touches flash, and waits for nothing — least of all for a host
// to be attached.
void reached(Phase phase);

// Starts the window this boot has to survive before its predecessors are
// forgiven. Without it a crash a second after startup finished would clear the
// counter on every attempt and never reach the threshold, and the device would
// reboot forever instead of falling back to the link.
void arm_stability_window();

// Forgets the failures now. A host that has successfully written a document —
// or erased one — has both changed whatever broke the board and proved it can
// reach it.
void clear_failures();

}  // namespace simcore::boot_guard
