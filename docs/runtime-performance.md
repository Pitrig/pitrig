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
idf.py -B build-debug \
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

- **FPS:** number of LVGL refreshes that performed rendering, divided by the
  actual sampling interval. Idle refresh callbacks are not counted, so a
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
- **Max:** the slowest single frame in the interval, measured from
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
- **Heap:** current free internal 8-bit heap and its largest free block.
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
