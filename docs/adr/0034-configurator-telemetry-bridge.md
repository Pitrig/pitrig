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

Taking the stream over a serial port first was tried and rejected. An
application cannot create one on Windows — there is no user-mode API, and a
virtual pair needs a kernel driver — so the configurator had to host a pty on
macOS and ask for a com0com half elsewhere: a per-platform install step, a
230400 baud ceiling on the hosted port, and a dependency touching undocumented
`node-pty` internals, all to move bytes between two processes on one machine.

## Decision

The configurator sits in the middle of the link. Telemetry arrives from the
**Pitrig SimHub plugin** over a local socket, is forwarded to the board
unchanged, and is decoded in passing to drive the previews. The plugin replaces
the Custom Serial profile, which stays supported for a board fed directly
([SimHub telemetry](../simhub-custom-serial.md)).

**A datagram per tick.** The plugin sends UDP to a port the configurator binds:
a seven-byte header — magic, version, sequence — and a payload of whole
`id;value` lines, at most 1200 bytes. No connection to establish, no Nagle, and
no head-of-line blocking, so a busy moment in the configurator costs the oldest
packet rather than a growing backlog of stale values. The sequence measures
loss; a restart of the sender resyncs rather than being read as reordering.

**Forward first, parse after.** The payload is written to the board before it
is looked at, so the bridge adds one event-loop hop and no copy. A datagram
carries whole lines by construction, so the board never sees a spliced one and
no reassembly is needed on either side.

**Yield the link, resume on the next datagram.** While a `@PR:` operation or an
asset upload owns the port the bridge stops writing and drops what arrives — a
stale backlog is worse than a gap. Live apply and a save therefore work while
telemetry streams, and the plugin's periodic keyframe repairs whatever the
board missed within a second.

**Send what changed, repeat everything once a second.** The plugin evaluates
each field at its catalog rate, sends a value only when it differs from the one
it last sent, and re-sends every known value once a second. A lost datagram
therefore costs at most one second of a rarely-changing field, and a plugin is
not bound by the 10 Hz cap SimHub Free puts on Custom Serial.

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

**The configurator dials, the plugin answers.** The configurator names the
machine SimHub runs on and sends a bare header to the plugin once a second; the
plugin streams to whatever address that request came from and forgets it after
three seconds of silence. The address is knowledge the authoring side already
has and the sim rig does not, so a rig on a second machine is configured where
someone is already sitting, and the plugin needs nothing typed into it. Naming
a non-loopback machine is itself the explicit choice to listen beyond
`127.0.0.1`, and datagrams from any other address are dropped, so the opened
socket is narrower than an accepted-from-anywhere one. A new subscriber is sent
a keyframe at once rather than waiting up to a second for the next.

**Measured, not asserted.** The bridge keeps two latency histograms — what it
adds before the write, and what the write itself costs — plus line, field, byte
and packet rates, lost packets, dropped bytes and write errors, and the Protocol
page shows them.

## Consequences

- The dashboard preview, the lamp preview and the telemetry catalog show live
  values, and a board can be watched at the same time, with nothing to install
  besides the plugin.
- The field mapping has one source: `telemetry/simhub_generic_mappings.json`
  generates the NCalc expressions of the Custom Serial profile and the plugin's
  own field table, so the two paths cannot drift.
- The plugin is a .NET Framework assembly built against the SimHub install, so
  it is not part of the repository's CI; only its generated field table is
  checked.
- UDP can drop a datagram. Changes-only fields are the exposed case, and the
  one-second keyframe is what bounds it.
- Reaching a plugin across the network needs the operating system's permission
  for local traffic — on macOS the app has to be allowed under Local Network
  before the configurator can ask a plugin on another machine.
- The plugin binds a port of its own, distinct from the configurator's, so both
  can run on one machine; the two sides have to be updated together.
- Two parity gaps remain against the board: `dashboard.smoothing`
  ([ADR 0033](0033-value-smoothing-between-packets.md)) glides between packets
  and the preview steps, and `session.lap.current_time` is extrapolated on the
  device and only sampled here.
