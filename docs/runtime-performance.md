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

What follows for authoring: **compose several values into one text widget rather
than placing one widget each.** A widget with three sources is one area; three
widgets are three, and the same three numbers cost 735 µs against ~1,700 on the
P4. Shrinking a font is the other lever, and it pays quadratically.

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

### The ESP32-P4's accelerator, and when it is worth using

LVGL hands the PPA every opaque, square, ungraded fill. Submitting one and
waiting for it costs the same whatever it fills, so the accelerator is a trade
rather than a win: measured against the processor doing the same work, it costs
**+103 µs per changing widget** — about 51 µs for each of the two fills a
readout makes — and saves **18.4 ns per pixel** (25.9 against 44.3).

| | fixed per changing widget | per pixel |
| --- | ---: | ---: |
| fill on the PPA | 367 µs | 25.9 ns |
| fill on the processor | 264 µs | 44.3 ns |

The crossover is around 1,500 pixels, which is why
`patches/lvgl-9.5.0-ppa-small-fill-threshold.patch` leaves smaller fills on the
processor: a 12 px readout costs 314 µs a widget instead of 402, a 72 px one
still goes to the accelerator. Two things never reach it at all — a fill with a
`radius_px`, because a rounded corner needs a mask, and text, because a glyph is
blended through an alpha mask. A rounded background on a widget therefore costs
more on the ESP32-P4 specifically, where the square version would have been the
accelerator's.

### What a screen change costs

Measured with four screens of 24 widgets each, telemetry at 30 Hz, while a hand
swiped through them continuously. Median render time per frame:

| | steady | `transition: none` | `transition: slide` |
| --- | ---: | ---: | ---: |
| Guition ESP32-4848S040 | 12.8 ms | 25.1 ms | **42.1 ms** |
| Guition JC1060P470C | 7.3 ms | 18.5 ms | **30.7 ms** |

The mechanism is the one the cost model predicts. At rest a frame draws one
small area per changing widget — eleven of them here. During a change it draws
one area covering the whole screen, so the price stops being per widget and
becomes per screen; the slide then pays it twice over, because the animation
composites the outgoing and incoming screens together for every frame it runs.
The longest frame reaches 82 ms on the 4848S040 and 66 ms on the JC1060P470C,
so the animation itself moves at 12–15 fps rather than the panel's 60.

**A slide costs about 1.7× what an instant change costs**, on both boards, and
three to four times the steady state. That is the trade `transition` exists to
let an author make: a dashboard whose screens are full is smoother to switch
with `none`.

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
areas it saves. Measured on both, rejected on both.

Per changing widget, after the settings of
[ADR 0026](adr/0026-ui-memory-in-external-ram.md): **~1,250 µs on the
T-Display-S3**, **~820 µs on the Guition ESP32-4848S040**, **~450 µs on the
Guition JC1060P470C**. A frame has to fit every widget that changed in it, so
what a board can carry is that figure against the panel period — roughly 25
simultaneously changing widgets at 60 Hz on the JC1060P470C, and a handful on
the S3 boards — while the widgets that do not change cost almost nothing.

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
