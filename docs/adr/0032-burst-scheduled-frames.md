# ADR 0032: Burst-Scheduled Frames on the ESP32-P4

Status: Proposed, as a build option that is off by default. Extends the strip-composed
tear-free mode of [ADR 0027](0027-partial-render-buffers-and-unsynchronized-scan-out.md) and
keeps the observation-only rule of
[ADR 0028](0028-debug-build-and-debug-application-boundary.md): every counter it exports is
read by the debug build alone.

## Context

On the JC1060P470C a value reaches the panel about 25 ms after it lands in its slot, on a
screen whose drawing costs 4 ms. The frame is tear-free and lands once per refresh, so the
waiting is the price of the cadence — but it is a whole refresh more than it has to be, and the
reason is structural. A frame starts when telemetry arrives; the finished frame is held until
the panel latches it; and LVGL waits through that hold, so the burst that arrives during it is
drawn only after the latch and shown a refresh later. The display is permanently one refresh
behind the data, a queue of depth one that never drains, because the feed (60.0 Hz) is faster
than the panel (16.986 ms, 58.87 Hz) and nothing drops the surplus on purpose.

Two facts about the feed decide what a better schedule can look like. It is periodic but not
synchronous with the panel: the packet phase moves a third of a millisecond every frame and
sweeps the whole period once every 0.9 s, so a start fixed to the vsync is crossed by the
packets once a second. And it jitters by about 2.5 ms as seen on the board — from the USB link
and the transport, not from the host; a spin-waiting host tick measured the same. Near any
fixed boundary, that jitter turns every frame into a coin toss between a skip and a repeat.
And since 60 packets a second cannot all be shown at 58.87 refreshes a second, any policy
drops 1.13 packets a second; the only question is which, and whether the display shows a hole
in the process.

## Decision

**Under `CONFIG_SIMCORE_DISPLAY_VSYNC_LOCK`, telemetry only writes the widgets, and each burst
of it arms one frame start.** The burst is stamped on the link's own task, on the first value
of a burst and before anything decides whether the display is busy, so its arrival is known
when it happens rather than when LVGL gets round to applying it. The frame starts a short
allowance after the burst — enough for the burst's remaining chunks, 0.3–3 ms, tuned by the
bursts that arrive after it — and lands on the first latch it can make. A burst that comes too
late in the period for the next latch is drawn for the one after, consistently, not by chance.

**A start is deferred when the previous frame has not latched yet and this frame could still
have made the next latch** — with the mode's peak cost, a millisecond, and twice the measured
jitter in hand. Starting it would only make it sleep on its first strip until the pending
latch and then take the refresh after that: one period behind, and the state sustains itself
because the next start finds the same thing. Skipping it drops exactly the surplus packet the
faster feed forces some policy to drop, and the next burst's frame lands on the same refresh
with newer values. When the frame could not have made the next latch regardless, being a
period behind is the truth of the timing, and the frame starts and shows every packet.

**A screen whose frame fills the period starts at the latch and ignores bursts**, as it does
without the option, and leaves that mode only after two seconds of frames that fitted with
room to spare — a heavy frame once a second would otherwise flip the start every few frames.

**The vsync still arms a start of its own, half a period after the next burst is expected,**
only when nothing is armed. It exists for a screen that animates while no packet arrives; a
burst that does arrive re-arms it to its own time. Placed at the expectation it fired just
before half the bursts and pushed their frames a refresh behind.

Four defects in the path from a wake to a drawn frame had to go for any of this to hold, and
each was found by counting: the vsyncs, the swaps that latched, the starts by what woke them,
and the wakes that drew nothing, over `@SC:DIAG`.

- The measured frame cost included the previous swap's hold, paid at this frame's first strip
  because LVGL ends a refresh before the swap latches. A 4 ms screen measured as 15 ms, and
  the scheduler locked itself into starting at the vsync. The cost is now the span minus the
  time slept in the flush wait, on every P4 build.
- LVGL's refresh timer is not due for 4 ms after a short frame, so a wake ran nothing. The
  port makes it ready on every display wake.
- The port loop takes the LVGL mutex with no timeout after a wake; when the render trigger
  held it, the event bits were already consumed and the start was lost. The bits go back.
- LVGL pauses its refresh timer while nothing is invalid and resumes it on the next
  invalidation, so a wake that came before the burst ran nothing and sent no event. The port
  loop compares the refresh count across the handler, and a wake that drew nothing arms the
  next invalidation to start the frame at once.

Everything lives in the last `esp_lvgl_port` patch of the stack,
`esp-lvgl-port-2.8.0-burst-scheduled-frames.patch`, and two product hooks: the dashboard
composition notes every telemetry value before its busy gate, and the render trigger no longer
wakes LVGL under the option. Off, the builds compile the same code they did, except the frame
cost measurement, which is a correction rather than a choice.

## Consequences

Measured over ten seconds on the debugger's feed, the sleeping-flush-wait build against the
scheduler, value latency and refreshes per second:

| screen | before | with the scheduler |
|---|---|---|
| eight text widgets (`text_only`) | 23.3 ms, 59 fps | 10.4 ms, 59 fps |
| Lovely times screen (`p2`) | 25.3 ms, 59 fps | 13.1 ms, 57 fps |
| Lovely fuel screen (`p3`) | 15.5 ms, 58 fps | 12.9 ms, 54.5 fps |
| Lovely main screen (`p1`) | 21.5 ms, 59 fps | 19.0 ms, 55 fps |
| sixteen text widgets (`text_16`) | 23.7 ms, 59 fps | 21.3 ms, 57.8 fps |

Light screens gain most of a refresh. The main screen and `text_16` are heavy — their frames
reach 10–15 ms — and stay on the latch start, where the scheduler changes only who wakes the
task; they gain a millisecond or two and show one to three holes a second that the build
without the option does not. The fuel screen's lower refresh count is mostly not repeated
frames: its packets change no widget in about five periods a second, and the build without
the option draws those periods anyway — both builds carry 52–54 new values a second to the
panel.

The corrected frame cost changes one thing on every P4 build, option or not: a frame that
outlasts the period is paced to the second refresh more often, because the pacing rule of ADR
0027 now sees the true cost rather than one with the previous hold subtracted. The debugger's
`full_screen_bar`, whose frames take 18–20 ms, goes from 45.8 to 41 fps without the option and
39.5 with it — a steadier cadence at a lower rate. Nothing in a real dashboard repaints the
whole screen every frame; the Lovely screens measure the same either way.

What remains is the jitter. On the times screen the display switches between on time and one
refresh behind about twice a second, each switch a repeated frame or a dropped packet; the
band the deferral keeps in hand can be widened, and every millisecond of it buys rhythm for
latency. The option is therefore off by default until the motion has been judged by eye, which
no counter can do.

The scheduler is only for the P4: it needs the three panel frame buffers and the strip
composition, and the two S3 boards compile the same file with the option undefined. It adds no
task to the product; the scheduler task and the one-shot timer exist only under the option.

`CONFIG_SIMCORE_DISPLAY_JIT` (`sdkconfig.defaults.jit`, `esp-lvgl-port-2.8.0-jit-frame-start.patch`)
is the earlier experiment this scheduler superseded — start each frame as late as it can still
meet the panel — and stays only for comparison.
