# Runtime Performance Diagnostics

The `simcore::performance` service publishes a one-second snapshot containing
FPS, CPU usage per core, the render/flush/sync split of a frame, the slowest
frame and its processing and idle parts, internal heap information, available
PSRAM, uptime, and the free stack of each monitored task. The debug overlay
adds transport counters read straight from the active transport.

## Build profile

Runtime diagnostics are disabled in production. They are selected by the
`CONFIG_SIMCORE_DEBUG` Kconfig option, which
`firmware/utils/simcore_config/include/simcore_features.hpp` aliases to
`SIMCORE_DEBUG`. Checked-in board profiles and IDE tasks are the single source of
feature selection; no source header is edited.

Build with the debug ESP-IDF defaults appended after the board profile, which
enables the option together with the FreeRTOS runtime counters it needs:

```sh
idf.py -B build-t-display-debug -DIDF_TARGET=esp32s3 \
  -DSDKCONFIG=sdkconfig.generated.t-display-debug \
  -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.t-display-s3;sdkconfig.defaults.debug" \
  build
```

Use the required board defaults file in place of `sdkconfig.defaults.t-display-s3`.
The debug defaults enable the 64-bit ESP Timer runtime counter required for CPU
load measurement. Without `SIMCORE_DEBUG`, transport diagnostics, display
instrumentation, and the dashboard overlay are removed from the production hot
path, and FreeRTOS runtime statistics remain disabled.

## Reading the snapshot over the link

The same snapshot is answered on the serial link by `@SC:DIAG`, alongside live
heap figures the overlay does not draw: the total and lowest-since-boot free
bytes of both heaps. That is what makes a memory budget measurable — a host can
apply a document and read what it cost, in bytes, without anyone reading the
panel. The command exists only in a build that has this service; a product build
answers `@SC:ERR:unsupported`. The reply's field list is documented in
[device-configuration.md](device-configuration.md).

## Measurements

Every figure below covers the **last second, on a window that slides**: the
sampler folds a 50 ms slice into a twenty-slice ring twenty times a second and
republishes the whole window each time. A second's worth of frames is what makes
an average steady — a window as short as a poll would quantize 60 fps into ±17%
noise — but a reader is never handed the same snapshot twice, so polling
`@SC:DIAG` at 100 ms shows values that moved since the previous poll instead of
one frozen block per second. Sums (frames, render, flush, sync, latency, areas)
span the window; the maxima (`frame_max_us`, `work_max_us`, `gap_max_us`,
`lat_max_us`) are the largest in it, so a spike appears at once and ages out a
second later rather than being cleared on a boundary. Heap, PSRAM and the stack
high-water marks keep the original once-a-second cadence — walking the heap costs
far more than the frame counters do, and neither figure moves within a window.

- **FPS:** number of LVGL refreshes that performed rendering, divided by the
  window's own measured duration. Idle refresh callbacks are not counted, so a
  dashboard whose values change more slowly than the display refreshes reports
  fewer frames without being late. Since [ADR
  0027](adr/0027-partial-render-buffers-and-unsynchronized-scan-out.md) no
  board waits for the panel before reusing a buffer, so FPS can exceed the
  panel scan rate; the panel shows at most its own rate of them.
- **CPU0 / CPU1:** `100%` minus the idle task runtime percentage for each core,
  calculated from consecutive FreeRTOS runtime-counter samples.
- **Render time:** average drawing time per rendered frame, measured between
  the LVGL render-start and render-ready events with the time spent inside
  the flush callback or waiting for a flush subtracted. LVGL flushes from
  inside its render pass, so without that subtraction a blocking flush would
  be reported as drawing.
- **Flush time:** average time per rendered frame spent inside the flush
  callback plus waiting for a previous flush to complete. On boards that
  render directly into the panel frame buffers this is the frame-buffer
  cache write-back plus the wait for the panel to finish scanning out the
  previous frame.
- **Sync time:** average time per rendered frame between refresh start and
  render start: layout and, in direct mode with two frame buffers, the copy
  of the previous frame's changed areas into the buffer about to be drawn.
- **Max:** the slowest single frame in the window, measured from
  refresh start to refresh ready. It settles near one display period while
  every frame reaches the display in time; a multiple of that period means
  frames missed their scan-out and the reported FPS is a fraction of the
  panel refresh rate.
- **Work:** the largest render plus sync of a single frame, with every wait
  removed. A `Max` of several display periods with a normal `Work` means the
  frame was not slow to draw — it was late or blocked.
- **Idle:** the longest gap between one frame finishing and the next starting.
- **Latency** (`lat_us` / `lat_max_us` / `lat_n` on the link): average and worst
  time from a telemetry value's commit into its slot to the display accepting
  the frame that drew it, and how many frames carried one. The one figure that
  covers the whole path — wake, render and flush together.
- **Heap:** current free internal 8-bit heap and its largest free block. The two
  largest-free-block figures are refreshed only every five seconds, and `@SC:DIAG`
  serves them from that sample rather than measuring them itself: finding the
  largest free block walks every block of the pool with the heap spinlock held,
  which disables interrupts for the whole walk. Called per poll on the PSRAM pool
  — which holds every LVGL allocation — it delayed the display driver's
  end-of-frame interrupt past the frame boundary often enough to blank single
  frames on the panel. `heap_caps_get_free_size` and `heap_caps_get_minimum_free_size`
  read counters and stay per-poll; nothing reaching `heap_caps_get_info` may go on
  a periodic path while the display runs.
- **PSRAM:** current free SPIRAM heap, or zero when SPIRAM is unavailable.
- **Uptime**, and the transport counters **Link** (bytes and reads per second),
  **Queue**, **Overflow**, **Gap**/**Handler** (worst read gap and handler time
  since boot), and **Stack** (free bytes of the LVGL, transport, configuration,
  asset-upload and sampler tasks). The font and image upload tasks share one
  stack figure, reported as the smaller of the two, because only one of them can
  own the serial link at a time.

The service owns measurement and aggregation. What a debug build draws over
the dashboard is the `SIMCORE_DEBUG_OVERLAY` Kconfig choice: the full
statistics panel, an FPS-only chip (the default — the full panel blends over
the widgets beneath it and distorts small-display measurements), or nothing.

Dashboard glyphs are rasterized from the uploaded font faces and cached per
font in external RAM. Composition pre-warms the characters a dashboard draws,
so a steady-state frame performs no rasterization; a character outside the warm
set shows up as one longer frame in **Max** and is cached afterwards.

## What a frame costs

Measured on all three boards over `@SC:DIAG`, by applying dashboards of growing
widget counts and feeding telemetry at a fixed rate. The shape of the answer
matters more than any single number:

A frame draws **areas**, not widgets. Each widget that changed contributes one
invalidated area — its own **content**, not its box, which is why widening a
readout's box changes nothing and enlarging its font changes everything. What
one area costs, measured by growing a single readout's font from 12 px to 72 px
and fitting the result:

| | fixed, per drawn area | per invalidated pixel |
| --- | ---: | ---: |
| T-Display-S3 | ~734 µs | 93 ns |
| Guition JC1060P470C | ~509 µs | 13 ns |

On the ESP32-P4 the fixed part is around 85% of a typical readout's cost, which
is why nothing pixel-shaped ever moves it. On the ESP32-S3 the two halves are
comparable at ordinary font sizes.

Two more terms:

- **Every object on the screen is walked for every drawn area**, changed or not:
  24 static shapes add ~380 µs to a single-area frame on the S3 and ~615 µs on
  the P4, and that is paid again for each further area. Decoration is not free.
- **Each additional glyph in the string adds ~35 µs**, on both chips, and each
  extra LVGL object a widget is built from (a background inset, a border, a
  caption) adds 100–170 µs — a rounded border, which draws through a mask, 344.

What follows for authoring — the rules that make a new screen fast without
per-screen tuning:

- **Compose several values into one text widget rather than placing one widget
  each.** A widget with three sources is one area; three widgets are three,
  and the same three numbers cost 735 µs against ~1,700 on the P4.
- **Budget a screen by its changing readouts, not its widget count**: about
  sixteen values changing at telemetry rate hold 60 fps on every board (the
  measured figures are below). Static widgets are nearly free at rest — but
  every object on the screen is walked for every drawn area, so heavy
  decoration taxes each changing widget.
- **Shrink fonts where the value allows it** — pixel cost is quadratic in
  size, and on the ESP32-S3 it is half of an area's price.
- **Screens that are not shown cost nothing**, so splitting a dense dashboard
  across screens buys frame budget directly; transitions are tear-free and do
  not tax the steady state.
- **Verify, don't guess**: apply the document and read `render_us` and
  `lat_us` back over `@SC:DIAG`, with the FPS chip on the panel.

### Where an area's time goes

Timed inside LVGL's refresh with a temporary probe, per drawn area, one changing
20 px readout on a screen with nothing else:

| | T-Display-S3 | JC1060P470C |
| --- | ---: | ---: |
| layer setup | 2 µs | 3 µs |
| object-tree walk | 417 µs | 226 µs |
| drawing the tasks | 888 µs | 399 µs |
| sending the buffer | 139 µs | 8,655 µs |

These figures were measured under the direct-mode buffering [ADR
0027](adr/0027-partial-render-buffers-and-unsynchronized-scan-out.md) since
replaced; with partial buffers the "sending" term is a strip copy of a few
hundred microseconds and no board waits for scan-out. The split between walking
and drawing still holds. The two boards were limited by different things, and
it decides which advice applies to which. **The ESP32-S3 is CPU-bound**: 61% of an area is the software
blender working at roughly 150 ns per pixel, another 29% is the tree walk, and
the panel takes the result in 139 µs. **The ESP32-P4 is display-bound**: its
drawing is over in 400 µs and then the frame waits ~8.6 ms for the panel to
scan out — half a 60 Hz period, which is what a value arriving at an arbitrary
moment should expect. Its four-widget benchmark spends 1.8 ms of CPU inside a
16.7 ms frame, so the headroom there is large and the way to use it is more
widgets, not faster ones.

A changing readout costs three draw tasks on the S3 — the screen background
under it, the widget's own fill, and the label — at ~300 µs each.

### The ESP32-P4's accelerator, and why it is off

LVGL hands the PPA every opaque, square, ungraded fill, and the draw unit
waits for it — the render core stands blocked for 168-445 us per fill while
the software blender does the same work in 36-215 us. That trade once made
sense: under the original DIO flash and 128 KB L2 cache the processor blended
at ~44 ns per pixel against the PPA's ~26. QIO and the 256 KB cache made the
software path faster at every fill size measured since — a 32-readout grid of
square panels renders 22.8 ms a frame with the accelerator and 16.3 ms
without, and even the full-screen bar no longer wins. `LV_USE_PPA` is
therefore off in `sdkconfig.defaults.esp32p4`; the three PPA patches under
`firmware/patches/` stay, so re-evaluating the accelerator later — or making
it non-blocking — is a one-line Kconfig change. While it was on, rounded
corners measured *faster* than square ones, because a rounded fill cannot go
to the PPA; with it off the intuitive order is restored and a transparent
widget background is the cheapest of all.

### What 24-bit colour costs on the ESP32-P4

`SIMCORE_DISPLAY_COLOR_DEPTH` offers the JC1060P470C 16-bit RGB565, which is
what it ships with, and 24-bit RGB888; `sdkconfig.defaults.color-24bit`
selects the second and raises `LV_COLOR_DEPTH` with it. The panel accepts
both — at the 50 MHz pixel clock the DSI link carries 800 Mbit/s of RGB565 or
1200 of RGB888, inside the 1500 the two 750 Mbit/s lanes provide.

Three bytes a pixel are spent everywhere at once: the three panel frame
buffers grow 3.69 MB to 5.53 MB, and the render strips 240 KB to 360 KB. The
strips also *move*: `esp_lvgl_port` refuses a DMA-capable buffer in any format
but RGB565, so an RGB888 build allocates them from external RAM, and the
driver sets `buffer_in_psram` for exactly that reason. Because buffer
placement changes which composition mode the adaptive full-strips logic
settles on, colour depth was measured against a 16-bit build whose strips were
moved the same way rather than against the shipping one. Both modes are
tear-free, so nothing is traded for the frames below.

Measured with a full-width dashboard at a 60 Hz feed, matched buffer
placement: a light screen (rev strip, gear, speed, rpm) falls 59 to 53 fps and
a dense one (20 widgets, two bars, two arcs, six readouts) 59 to 36 — render
per frame +64 to +78%, and on the dense screen flush doubles, 6.7 to 12.9 ms.
Against the shipping 16-bit build the dense screen falls 47 to 36 fps.
Latency follows: 22 ms to 39 ms on the dense screen. The cost is proportional
to the pixels a frame actually moves, so it lands on the frame rate of a busy
screen and is barely visible on a quiet one.

That control also exposed a defect in the mode economics, which is described
below and has since been fixed; the colour-depth figures above are the ones
measured after that fix, so they compare two builds that both compose the way
they should.

### Which composition mode full strips settles on

The adaptive full-strips logic runs whichever of its two modes it measures as
cheaper — repainting the whole frame, or reconciling the untouched rows from
the previously presented buffer and drawing only the damage. Both are
tear-free, so the choice is purely about cost. It was choosing badly.

Both modes start at a seeded 30 ms, `mode_best` starts on reconciliation, and
the first frames probe the other mode because it is still unknown. The seed
then decided the outcome twice over. A probed mode only ever ran three or four
frames, and an eighth-weight average moves from 30 ms to about 25 in four
frames however fast the mode really is — so a mode that costs 9 ms was compared
at 25. And a mode that had never run a single frame was compared at its 30 ms
seed as though that were a measurement. Whichever mode happened to be probed
first therefore won, and the loser was then rarely re-probed, because probing
stops once the winner fits inside the frame budget.

The effect was deterministic rather than random: five independent boots of each
build chose the same mode every time. On the shipping ESP32-P4 build the wrong
choice cost a fifth of the frame rate on a dense dashboard — 47 fps where
forcing the other mode gave 59.

That first fix — a mode's opening frame replaces its seed instead of blending
with it, and no switch until both modes have replaced theirs — moved the
synthetic patterns but left a worse case standing. The Lovely-derived template's
main screen, 68 widgets fed at the rates a real car produces, still chose
differently from boot to boot: five boots of eight ran it at 59 fps with a
4.6 ms render, three at 28 fps with 32 ms. A seed is one sample, and on a screen
this size the samples available early are all contaminated.

They are contaminated in one direction, which is what makes averaging useless.
Past `LV_INV_BUF_SIZE` invalid areas LVGL discards the list and repaints the
whole screen, and a 68-widget composition passes that every frame until it
settles. A whole-screen *partial* frame pays the reconcile copy on top of the
repaint that a widened frame skips — so during composition widened is genuinely
cheaper, by about one frame copy, and a sample taken there is right about that
window and wrong about every frame after it.

So the economics now records nothing until the screen stops changing shape. A
settle gate stays shut until eight consecutive frames have covered less than
half the screen (or four seconds pass, for a dashboard whose ordinary damage
really is the whole screen); while it is shut the display keeps drawing whichever
mode is believed — both are correct, and forcing one costs every screen whose
winner is the widened one — but nothing is measured and nothing is probed. Each
mode then seeds from the cheapest of its first four frames, since frame cost has
a hard floor and a one-sided tail. Two different events used to share one
threshold: ordinary drift now only stops the loser being believed, while a cost
that moves by a factor of four means the dashboard was replaced and shuts the
gate again.

Measured over the debugger's own sixteen stress patterns and the three Lovely
screens, before against after: the main Lovely screen is 59 fps on every boot of
six, render 4.6 ms, latency 21 ms. `shapes_96` 33 to 59, `text_32_plain` 46 to
57, `text_32` 50 to 55, `bars_24` 47 to 51; eleven patterns do not move. Two pay
for it — `full_screen_bar` 49 to 42 and `indicators_12` 58.5 to 54 — because the
gate delays electing the widened mode on screens that want it, and those two want
it most.

### Where a frame's latency actually goes

A value reaches the panel about 22 ms after it lands in its slot, on a screen
whose drawing costs 4.5 ms. The difference is not computation, and the counters
say so plainly: on every screen fast enough to reach the panel rate,
`render_us + flush_us` comes out at roughly one frame period whatever the screen
holds — 1.98 + 13.61 on eight text widgets, 7.77 + 7.35 on sixteen. Flush
absorbs exactly what render does not, because the flush worker holds a finished
frame until the panel is ready for it. So the budget is about a third drawing
and two thirds waiting: half a frame for the next refresh to begin, then the
hold.

**The hold was also being spent at full processor.** LVGL waits for an
asynchronous flush in `wait_for_flushing`, and with no `flush_wait_cb` installed
that wait is `while(disp->flushing);` — no yield, no sleep. The port installed
none, so the render core spun for the whole hold. Installing one that sleeps a
tick until the port's own pending-flush count reaches zero costs nothing and
returns 27 points of core 1 on average across the debugger's sixteen stress
patterns (93.7% to 66.3%), and 79 points on the lightest of them (93.7% to
14.9%). Frame rate, latency and cadence are unchanged: this is a defect being
removed, not a trade. Only `text_64` and `graphs_6` do not move — they never
finish inside a frame period, so they were never holding.

Removing the hold itself is a separate question and a real trade, so it is a
build option rather than a default: `CONFIG_SIMCORE_DISPLAY_UNCAPPED`
(`sdkconfig.defaults.uncapped`). It halves what is left of the latency — the
Lovely main screen 21.8 to 12.8 ms, its fuel screen 12.5 to 7.9, `text_only`
23.3 to 7.4 — and lifts the frame rate past what the panel shows, which means
the processor draws frames nobody sees. The hold exists to keep every rendered
frame on screen exactly once; the numbers say what the latency would be without
it, and say nothing about how the motion then looks.

### Scheduling the frame from the burst

The two thirds of waiting above is not half a period plus a hold; it is a whole refresh, and
it is structural. LVGL sits in the flush wait for the entire hold, so the burst of telemetry
that arrives during it is drawn only after the latch and shown one refresh later — the display
is permanently one refresh behind the data. It stays there because the feed (60.0 Hz) is
faster than the panel (16.986 ms, 58.87 Hz) and nothing drops the surplus on purpose.

[ADR 0032](adr/0032-burst-scheduled-frames.md) is the answer, as `CONFIG_SIMCORE_DISPLAY_VSYNC_LOCK`
(`sdkconfig.defaults.vsync-lock`, off by default): telemetry only writes the widgets, each burst
arms one frame start a short allowance later, and a start is skipped when the previous frame has
not latched and this one could still have made the next latch — that drops exactly the packet a
second the faster feed forces some policy to drop, and keeps the display on time. A burst that
comes too late for the next latch is drawn for the one after, consistently; a screen whose frame
fills the period starts at the latch as before.

Measured over ten seconds, sleeping flush wait against the scheduler: `text_only` 23.3 to 10.4 ms
at 59 fps, the Lovely times screen 25.3 to 13.1 ms at 57 fps, the fuel screen 15.5 to 12.9 ms,
and the main screen 21.5 to 19.0 ms at 55 fps — it is heavy and stays on the latch start, where
the option changes only who wakes the task, and it shows one to three holes a second that the
build without the option does not. What remains is
the link's own jitter, about 2.5 ms as seen on the board whatever the host does: on the times
screen it switches the display between on time and one refresh behind about twice a second, a
repeated frame or a dropped packet each time. The band the deferral keeps in hand can be widened,
and every millisecond of it buys rhythm for latency; the option stays off until the motion has
been judged by eye.

Four defects on the path from a wake to a drawn frame were found by counting vsyncs against
swaps and are fixed on every P4 build or under the option, as the ADR lists: the measured frame
cost included the previous swap's hold, LVGL's refresh timer was not due after a short frame,
a wake was lost when the port loop found the mutex busy, and LVGL pauses its refresh timer while
nothing is invalid. The first of these is a correction every P4 build carries, and it moves one
number: a frame that outlasts the period is now paced to the second refresh more often, so
`full_screen_bar` (18–20 ms frames) goes from 45.8 to 41 fps with a steadier cadence; the Lovely
screens measure the same as before. The debug build exports the accounting over `@SC:DIAG` — `acc_vsyncs` against
`acc_swaps` is the number of repeated frames, and `acc_start_*` says what woke each frame.

### What a screen change costs

A screen change draws whole screens rather than per-widget areas, and since
[ADR 0027](adr/0027-partial-render-buffers-and-unsynchronized-scan-out.md) it
also switches the display into its tear-free mode for the duration — the
navigation controller does this on every transition, `slide` and `none` alike,
so an author gets clean screen changes without doing anything. The steady
state pays nothing for it.

During a slide each animation frame composites the outgoing and incoming
screens — together one screen's worth of widgets — so the animation paces at
the full-screen frame rate, roughly 25–50 fps depending on how full the
screens are, rather than the 60 fps of resting readouts. An instant `none`
change costs one such frame. The trade `transition` offers is therefore only
about how the change looks; neither choice affects what the dashboard costs
between changes.

The direct-mode era measured this in numbers (four screens of 24 widgets,
30 Hz telemetry, continuous swiping): steady 12.8/7.3 ms per frame against
42.1/30.7 ms per slide frame on the 4848S040/JC1060P470C — the ~3–4× ratio
between resting and transitioning frames still describes the shape, even
though the absolute figures predate ADR 0027.

Photographing the two screens and animating the pictures instead — which would
put the moving frames on the ESP32-P4's image accelerator — was built and
measured, and it is **worse**: 36.1 ms a frame against LVGL's 30.7, unchanged by
reusing the previous slide's photograph or by dropping the fill behind them. The
reason is in the arithmetic rather than in the accelerator. LVGL moves the two
screens and draws only the part of each that is on the display, which together
is one screen's worth of widgets; two full-screen pictures are two screens'
worth of pixels, most of them clipped away after being blitted. Making the
moving frames cheap needs the visible slices composited directly into the frame
buffer, which is the display driver's business rather than LVGL's.

Merging areas does **not** work, in case it looks tempting: snapping every
invalidated area out to a 32-pixel grid so neighbours fold together halves the
area count and makes both boards slower — the pixels it adds cost more than the
areas it saves. Measured on both, rejected on both, and re-measured on the
ESP32-P4 with the flush moved off the render core: still 27–65% slower.

Per changing widget, after
[ADR 0026](adr/0026-ui-memory-in-external-ram.md) and
[ADR 0027](adr/0027-partial-render-buffers-and-unsynchronized-scan-out.md),
measured with the FPS-only overlay (the full statistics panel used to sit over
the benchmark widgets and inflate every small-display figure):
**~0.5–0.6 ms on the T-Display-S3**, **~0.6–0.75 ms on the Guition
ESP32-4848S040**, **~0.5–0.6 ms on the Guition JC1060P470C** — one ordinary
single-source readout each, growing mildly with the object count on screen. A
frame has to fit every widget that changed in it, so against the 16.7 ms
budget **roughly sixteen concurrently changing readouts hold 60 fps on every
board**; a screen with more does not break, it drops frames gracefully
(24 readouts ran at 31–42 fps, 32 at 23–34). Widgets whose values did not
change this frame cost almost nothing, and screens that are not shown cost
nothing at all — so a dashboard is budgeted per screen, by how many values on
it change at telemetry rate, not by its total widget count.

This is also why the per-type caps in the configuration contract are not a
memory decision: free internal RAM no longer moves with what is composed at all.
Raising one is a decision about the frame, and the way to judge it is to apply
the document and read `render_us` back.

## Memory

Free internal RAM is constant on every board, whatever the dashboard holds,
because every LVGL allocation comes from external RAM ([ADR
0026](adr/0026-ui-memory-in-external-ram.md)). `@SC:DIAG` reports both heaps;
`internal_free` staying put across an `@SC:APPLY` is the expected result, and a
figure that moves with the document means something is allocating outside that
allocator. External RAM is what a dashboard spends: a distinct
`(family, size_px)` pair costs 4–12 KB of it depending on the pixel size, and an
image costs its own pixels.
