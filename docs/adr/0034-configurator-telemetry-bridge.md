# ADR 0034: The Configurator as a Telemetry Bridge

Status: Accepted. Builds on
[ADR 0029](0029-single-link-and-composite-usb-gamepad.md), whose single link is
the reason the bridge has to exist, and on
[ADR 0005](0005-telemetry-ingestion-boundaries.md), whose fixed slot array the
bridge mirrors on the host.

## Context

A board carries exactly one serial link. SimHub holds it while it streams, so
the configurator cannot be connected at the same time — authoring and a running
car are mutually exclusive. The preview drew no telemetry at all: every source
showed a placeholder, which makes a colour rule, a gauge range or a condition
impossible to judge without saving to the board and looking at it.

An application cannot create a serial port on Windows. There is no user-mode
API; a virtual pair needs a kernel driver. macOS and Linux can allocate a pty,
which is a serial port to anything that opens it.

## Decision

The configurator sits in the middle of the link. Telemetry arrives on a port
the configurator owns, is forwarded to the board unchanged, and is decoded in
passing to drive the previews.

**Forward first, parse after.** A chunk from the source is written to the board
before it is looked at, so the bridge adds one event-loop hop and no copy. The
byte stream reaching the board is the one the source sent, so framing is
preserved by construction rather than by reassembly.

**Yield the link, resume on a boundary.** While a `@PR:` operation or an asset
upload owns the port the bridge stops writing and drops what arrives — a stale
backlog is worse than a gap. On resume it skips to the first newline, so the
board never sees a spliced line. Live apply and a save therefore work while
telemetry streams.

**Two ways to get a port, chosen by platform.** On macOS the configurator hosts
a pty and shows its path. Elsewhere it opens a port someone else paired —
com0com on Windows, any pty or adapter on Linux. Hosting is offered only where
it works, rather than presented and then failing.

**One snapshot per frame.** The tap decodes into three fixed arrays indexed by
catalog slot, the same shape the firmware's registry uses, and publishes at most
one snapshot per animation frame, only when a value actually changed. The
renderer keeps the table outside React and bumps a revision counter, so a live
feed costs one re-render per frame in the canvas and none anywhere else. The
source string is retained for every field, not only text ones, so the preview
shows what the board shows rather than a reconstructed float.

**The bridge is the switch.** Values are live whenever it runs; there is no
second toggle to disagree with it. Template thumbnails and the insert ghost keep
their placeholders — they are specimens, not the dashboard.

**Measured, not asserted.** The bridge keeps two latency histograms — what it
adds before the write, and what the write itself costs — plus line, field and
byte rates, dropped bytes and write errors, and the Protocol page shows them.

## Consequences

- The dashboard preview, the lamp preview and the telemetry catalog show live
  values, and a board can be watched at the same time.
- `node-pty` is a dependency for one call on one platform. Its `open()` is
  undocumented and its `onData` unusable, so the private fields it needs are
  confined to `pty-host.ts`; the module is loaded lazily and only on macOS.
- A hosted pty on macOS accepts at most 230400 baud. macOS routes faster rates
  through an ioctl a pty rejects, so a 921600 profile cannot open one.
- Windows still needs a virtual pair installed once. The configurator neither
  ships nor installs a driver.
- Two parity gaps remain against the board: `dashboard.smoothing`
  ([ADR 0033](0033-value-smoothing-between-packets.md)) glides between packets
  and the preview steps, and `session.lap.current_time` is extrapolated on the
  device and only sampled here.
