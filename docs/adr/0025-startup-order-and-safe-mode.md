# ADR 0025: Startup Order and Safe Mode

Status: Accepted. Reorders the startup phases of
[ADR 0011](0011-static-composition-and-module-lifecycle.md), narrows the
rollback trigger of [ADR 0022](0022-over-the-air-firmware-updates.md), and adds
two fields to the `INFO` reply of
[ADR 0006](0006-simhub-custom-serial-line-protocol.md).

## Context

Startup brought the serial link up last. `run()` loaded the configuration,
initialized the display, copied fonts and images into external RAM, composed the
modules and the dashboard, and only then started the transport and the `@SC:`
control protocol. Everything a board can be repaired with sat behind everything
a board can be broken by.

That ordering has one failure mode, and it is the one that matters. A
configuration the device accepts at `SET` and cannot compose at boot, a font
package that does not map, a panel that stops answering, a widget that
dereferences null — each of them stops startup before the link exists. On this
chip a crashed task is a panic that resets the whole device, so the result is a
board that reboots forever and never answers a host. There is no isolating one
task from the rest: FreeRTOS has no memory protection between them, and a
watchdog timeout is a reset, not a quarantine.

Two smaller faults followed from the same shape:

- Display initialization was a wall of `ESP_ERROR_CHECK`. A panel that failed to
  come up called `abort()`, which reset, which failed again — a reboot loop over
  a fault the rest of the firmware was perfectly able to survive, since the core
  already treats a null display as "this board draws nothing".
- The task watchdog was enabled but configured to print rather than to reset. A
  wedged LVGL task therefore left the dashboard frozen indefinitely, which is as
  unreachable as a crash and rather harder to notice.

## Decision

**The link comes first.** The startup phases are now:

```
boot guard → configuration → link + control protocol → display → assets →
modules + dashboard → composed → complete
```

The configuration stays ahead of the link because the `protocol` document
chooses the port, the pins and the baud rate. It is a handful of NVS reads and
no hardware, which is what makes it cheap enough to keep there. Opening the font
and image packages moved out of that phase and behind the link, since nothing
reads them until there is a dashboard.

Bringing the link up waits for no host. `transport->start()` installs a driver
and creates a read task; neither UART nor USB CDC has anything to wait for, and
a board with no PC attached passes through the phase in milliseconds.

**A boot that keeps crashing falls back to the link.** A `boot_guard` service
holds a counter in RTC memory, which survives the reset a panic causes and is
undefined after a power-on — so pulling the cable is a recovery that needs no
host, and a magic word tells the two apart. Only `ESP_RST_PANIC` and the three
watchdog reasons count; a restart the host asked for does not. Three in a row
and the next boot runs the **recovery surface**: the transport, the `@SC:`
control protocol and firmware upload, and nothing else. No display, no LVGL, no
dashboard, no modules, no font or image upload, and no telemetry decode.

The counter is cleared by the first document a host writes or erases, and by
nothing else: a board is out of safe mode when what broke it has been changed.
Because clearing it is what a `SET` does, the ordinary "save to board" is also
the way out, and the restart that save already performs starts a normal boot.
`RESET` clears it too — a board put back to its factory values must not come up
in safe mode for a configuration it no longer holds.

The counter is *not* cleared when startup finishes. It is cleared ten seconds
later, by a one-shot timer armed at the end of `run()`. Without that window a
fault that fires two seconds after composition would reset the count on every
attempt and never reach the threshold — the device would reboot forever and
never fall back to the link, which is the failure this ADR exists to prevent. A
boot with nothing counted against it arms no timer and pays nothing.

**A recovery boot ignores the stored `protocol` document** and runs the board's
own. The record is still read, validated and reported, so `INFO` and `GET`
answer with what is on the device; it simply does not choose the link. A stored
transport a host cannot reach would otherwise leave the recovery boot exactly as
unreachable as the boot it is recovering from.

**Rollback now triggers on the link rather than on the whole startup.**
`mark_running_image_valid()` is called as soon as the transport is up, including
in safe mode. What a firmware image has to prove is that it can be talked to:
past that point a broken dashboard is repairable by replacing it and a broken
image by uploading another, while an image that cannot reach that line is
repairable only by the bootloader taking it back. Validity cannot be made to
depend on a host answering — a board with no PC attached would then never
confirm an image, and every reset would roll back a working one.

**Display initialization is no longer fatal.** `display::initialize()` returns
`nullptr` where it used to abort, and the core logs it and carries on without a
dashboard. The first frame is still required: a panel that does not present one
is reported absent rather than composed onto.

**The task watchdog resets.** `CONFIG_ESP_TASK_WDT_PANIC` is on and the timeout
is ten seconds. Only tasks that actually feed it are watched:

- Each link's read task, whose wait is bounded so an idle link still feeds. The
  handler chain — line assembly, protocol decode, control intake — runs inline
  on these tasks, so a fault anywhere in it stops the task here.
- The render trigger, which takes the LVGL lock every round and feeds only once
  it has it. It cannot watch the LVGL task directly, because a task can only be
  fed from inside itself and that loop belongs to a vendor component; taking its
  lock is the next best thing, and a wedged LVGL task fails it.

The idle-task checks are deliberately off. Erasing the 4 MiB image partition
starves idle for seconds at a time, and that is work rather than a fault.

**A write waits for something to write to.** Because the link now answers before
the dashboard exists, `SET`, `APPLY` and `RESET` block on an event bit that
startup sets after composition, up to ten seconds, and are answered `busy` if it
never comes. `INFO`, `GET` and `VALIDATE` answer immediately — that is the point
of an early link — and so does `REBOOT`, which is what a host reaches for when
nothing else works. A recovery boot opens the gate as soon as the link is up.

**An upload waits for the same thing.** Startup copies the font and image
packages out of their partitions after the link answers, so an upload arriving
in that window would erase what startup was still reading. The shared
`binary_session::Claim` is therefore closed until composition finishes, and a
`BEGIN` or `CLEAR` for any kind is answered `busy` until it opens — which is
what it is: the device is busy starting. Firmware upload takes the same claim
and so waits with them, which costs a couple of hundred milliseconds and keeps
one rule instead of three. A recovery boot opens the claim as soon as the link
is up: it loads no assets, so there is nothing for an upload to collide with,
and firmware upload is one of the two ways out of it.

**`@SC:APPLY` is unsupported in safe mode.** The replacement transaction checks
a candidate against fonts and images that were never loaded, so it would refuse
every dashboard put to it. Safe mode registers no apply handler, which the
control service already answers `unsupported`.

**Log silencing moved to the end of startup.** A link configured to silence the
ESP log did so when it started. Starting first, it would have swallowed the log
of everything after it — which is precisely the log a board that fails to start
needs to have produced. A recovery boot never silences at all.

## Consequences

- A board answers `@SC:INFO` within milliseconds of reset rather than after
  composition. Reaching a board mid-boot, and reaching one whose dashboard is
  broken, both stop being matters of timing.
- `INFO` gains `safe_mode`, `boot_failures`, `reset_reason` and `last_phase`.
  Firmware without them reads as "cannot tell" in the configurator, never as
  "healthy".
- The configurator suppresses live apply in safe mode, skips the font package
  and the closing `APPLY` in a save, and always restarts after writing — the
  restart is the way out rather than an optimisation.
- On the Guition 4848S040, whose telemetry runs over the console UART, startup
  log lines now reach the wire. A host already streaming telemetry may see one
  garbled line at boot; the diagnosis this buys is worth more than the line.
- A dashboard that wedges LVGL for ten seconds resets the board. Nothing
  legitimate holds that lock for anything close to it — the longest is a
  dashboard rebuild during a live apply — but it is a bound where there was
  none.
- Safe mode is invisible without a host. The display is never initialized, so a
  board in it looks the same as a dead one until a cable is attached. That was
  the deliberate choice: LVGL and the panel driver are the likeliest thing to
  have crashed, and a recovery mode must not repeat the fault it recovers from.
