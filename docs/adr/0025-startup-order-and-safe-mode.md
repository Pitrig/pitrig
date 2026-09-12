# ADR 0025: Startup Order and Safe Mode

Status: Accepted. Reorders the startup phases of
[ADR 0011](0011-static-composition-and-module-lifecycle.md), narrows the
rollback trigger of [ADR 0022](0022-over-the-air-firmware-updates.md), and adds
two fields to the `INFO` reply of
[ADR 0006](0006-simhub-custom-serial-line-protocol.md). The amendment that let a
board declare a single-lamp status light is withdrawn: the status light is
removed (see [ADR 0030](0030-addressable-led-peripherals.md)), so the recovery
surface again reports through the link alone and a board with no screen is
invisible without a host.

## Context

Startup brought the serial link up last. `run()` loaded the configuration,
initialized the display, copied fonts and images into external RAM, composed the
modules and the dashboard, and only then started the transport and the `@PR:`
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
composition → complete
```

Every step after the boot guard is a `boot_guard::Phase` value —
`configuration`, `link`, `display`, `assets`, `composition`, `complete` — which
is what `INFO` reports as `last_phase`.

The boot splash is raised in the display phase and taken down at the end of
`complete`, so it covers the slow part — inflating fonts and images, composing
the dashboard — rather than a second of nothing before it. It is an opaque
black full-screen cover holding the logo inside a rounded frame in the logo's
own violets, lit by a highlight that travels around it with the frame's dark
side riding opposite. Both logo sizes are embedded on every board and the
largest that fits the panel with its glow is chosen from the display resolution
at runtime, so the splash is a property of the screen rather than of the build;
a panel too small for either shows none. The logo itself is never restyled
while it is up — an image the size of the logo repaints as a step rather than a
shimmer, which
read on the panel as a blink. The cover is also what
keeps the dashboard from being drawn at all while it is up: LVGL skips whatever
an opaque object covers. It is created on the display's **top layer** rather
than on the screen, so nothing composition adds later can draw over it — widgets
and captions are children of the screen and would otherwise appear above a cover
created before them, which read on the panel as the dashboard flashing through
mid-boot. The cover is deleted in one frame when the dashboard is ready — the
finished screen is the first thing drawn after it, with nothing dissolving over
a half-drawn dashboard. It is held for at least two seconds so a fast board does not flash
it, and a configuration that draws nothing — or one whose composition failed —
keeps it instead of showing an empty screen; the first applied document that
does draw something takes it down without waiting. "Draws something" is **any**
screen with a widget or a background of its own, not only the first, and it is
the same test in a debug build as in a product one.

The configuration stays ahead of the link because the `protocol` document
chooses the port, the pins and the baud rate. It is a handful of NVS reads and
no hardware, which is what makes it cheap enough to keep there. Opening the font
and image packages moved out of that phase and behind the link, since nothing
reads them until there is a dashboard.

Bringing the link up waits for no host. `transport->start()` installs a driver
and creates a read task; neither UART nor USB CDC has anything to wait for, and
a board with no PC attached passes through the phase in milliseconds.

**A link that will not start is retried once with the board's own `protocol`
document**, because a stored transport the board cannot bring up is exactly the
fault an early link exists to be repaired through. If the factory document does
not bring one up either, the board aborts: a reset is what makes `boot_guard`
count the attempt, and three of them put the next boot on the recovery surface.
Safe mode is already that surface, so it neither retries nor aborts — it logs
and stops. Failing to reserve the configuration memory stops the same way,
without a reset, because retrying an allocation that did not fit cannot succeed.

**A boot that keeps crashing falls back to the link.** A `boot_guard` service
holds a counter in RTC memory, which survives the reset a panic causes and is
undefined after a power-on — so pulling the cable is a recovery that needs no
host, and a magic word tells the two apart. Only `ESP_RST_PANIC` and the three
watchdog reasons count; a restart the host asked for does not. Three in a row
and the next boot runs the **recovery surface**: the transport, the `@PR:`
control protocol and firmware upload, and nothing else. No display, no LVGL, no
dashboard, no modules, no font or image upload, and no telemetry decode.

The counter is cleared by the first document a host writes or erases, and by a
firmware image that commits: a board is out of safe mode when what broke it has
been changed.
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
dashboard. Nothing on that path aborts, at either level: a board driver that
cannot bring its panel up releases whatever it created and returns a
`Configuration` with a null panel handle, and the display component unwinds LVGL
and calls the driver's `release()` before returning `nullptr` (ADR 0002). The
first frame is still required: a panel that does not present one is reported
absent rather than composed onto.

**The task watchdog resets.** `CONFIG_ESP_TASK_WDT_PANIC` is on and the timeout
is ten seconds. Only tasks that actually feed it are watched:

- Each link's read task, whose wait is bounded so an idle link still feeds. The
  handler chain — line assembly, protocol decode, control intake — runs inline
  on these tasks, so a fault anywhere in it stops the task here.
- The render trigger, which takes the LVGL lock every round and feeds only once
  it has it. It cannot watch the LVGL task directly, because a task can only be
  fed from inside itself and that loop belongs to a vendor component; taking its
  lock is the next best thing, and a wedged LVGL task fails it.

The idle-task checks are deliberately off. Erasing the image partition starves
idle for seconds at a time, and that is work rather than a fault. The partition
is 7 MiB, though a `BEGIN` erases only the arriving package's length rounded up
to the erase block, so the wait is proportional to the upload.

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

**`@PR:APPLY` is unsupported in safe mode.** The replacement transaction checks
a candidate against fonts and images that were never loaded, so it would refuse
every dashboard put to it. Safe mode registers no apply handler, which the
control service already answers `unsupported`.

**Log silencing moved to the end of startup.** A link configured to silence the
ESP log did so when it started. Starting first, it would have swallowed the log
of everything after it — which is precisely the log a board that fails to start
needs to have produced. A recovery boot never silences at all.

## Consequences

- A board answers `@PR:INFO` within milliseconds of reset rather than after
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
- Applying a document restarts only what its change reaches: `modules` restarts
  `rgb_leds`, and `dashboard` restarts the lap timer only when the document
  starts or stops using it.
- Safe mode is invisible without a host. The display is never initialized, so a
  board in it looks the same as a dead one until a cable is attached. That was
  the deliberate choice: LVGL and the panel driver are the likeliest thing to
  have crashed, and a recovery mode must not repeat the fault it recovers from.
