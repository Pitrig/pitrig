# Runtime Performance Diagnostics

The `pitrig::performance` service publishes a one-second snapshot containing
FPS, CPU usage per core, the render/flush/sync split of a frame, the slowest
frame and its processing and idle parts, internal heap information, available
PSRAM, uptime, and the free stack of each monitored task. The debug overlay
adds transport counters read straight from the active transport.

## Build profile

Runtime diagnostics are disabled in production. They are selected by the
`CONFIG_PITRIG_DEBUG` Kconfig option, which
`firmware/utils/pitrig_config/include/pitrig_features.hpp` aliases to
`PITRIG_DEBUG`. Checked-in board profiles and IDE tasks are the single source of
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
load measurement. Without `PITRIG_DEBUG`, transport diagnostics, display
instrumentation, and the dashboard overlay are removed from the production hot
path, and FreeRTOS runtime statistics remain disabled.

## Reading the snapshot over the link

The same snapshot is answered on the serial link by `@PR:DIAG`, alongside live
heap figures the overlay does not draw: the total and lowest-since-boot free
bytes of both heaps. That is what makes a memory budget measurable — a host can
apply a document and read what it cost, in bytes, without anyone reading the
panel. The command exists only in a build that has this service; a product build
answers `@PR:ERR:unsupported`. The reply's field list is documented in
[control-protocol.md](control-protocol.md).

## Measurements

Every figure below covers the **last second, on a window that slides**: the
sampler folds a 50 ms slice into a twenty-slice ring twenty times a second and
republishes the whole window each time. A second's worth of frames is what makes
an average steady — a window as short as a poll would quantize 60 fps into ±17%
noise — but a reader is never handed the same snapshot twice, so polling
`@PR:DIAG` at 100 ms shows values that moved since the previous poll instead of
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
- **Frame accounting** (`acc_vsyncs`, `acc_swaps`, `acc_start_timer` /
  `acc_start_late` / `acc_start_fallback` / `acc_start_burst` / `acc_start_other`,
  `wake_nothing`, `sched_*`, `pkt_*`, `cost_span` / `cost_wait`): cumulative
  counters from the ESP32-P4 port's frame pipeline. Vsyncs minus swaps is the
  number of repeated frames, the `acc_start_*` split says what woke each frame,
  and `cost_span` against `cost_wait` is how much of a frame's span was the
  flush wait ([ADR 0032](adr/0032-burst-scheduled-frames.md)).
- **Heap:** current free internal 8-bit heap and its largest free block. The two
  largest-free-block figures are refreshed only every five seconds, and `@PR:DIAG`
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
the dashboard is the `PITRIG_DEBUG_OVERLAY` Kconfig choice: the full
statistics panel, an FPS-only chip (the default — the full panel blends over
the widgets beneath it and distorts small-display measurements), or nothing.

Dashboard glyphs are rasterized from the uploaded font faces and cached per
font in external RAM. Composition pre-warms the characters a dashboard draws,
so a steady-state frame performs no rasterization; a character outside the warm
set shows up as one longer frame in **Max** and is cached afterwards.

## What a frame costs

Measured on the three display boards over `@PR:DIAG`, by applying dashboards of growing
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
- **Budget a screen by its changing readouts, not its widget count**: a
  changing single-source readout costs ~0.5–0.75 ms on every board, so about
  sixteen values changing at telemetry rate hold 60 fps, 24 ran at 31–42 fps
  and 32 at 23–34 — a screen with more drops frames gracefully. Static widgets
  are nearly free at rest — but every object on the screen is walked for every
  drawn area, so heavy decoration taxes each changing widget.
- **Shrink fonts where the value allows it** — pixel cost is quadratic in
  size, and on the ESP32-S3 it is half of an area's price.
- **`dashboard.smoothing` makes every followed gauge a changing readout while
  its value moves**: a bar, arc, needle, trace or number readout that follows
  redraws each frame between packets rather than once per packet, so the
  sixteen-readout budget above is spent on the followed widgets whether the
  feed is 20 Hz or 60. Indicators and conditions stay on the packet. A needle is
  the cheapest of them to follow: it invalidates only the box around its pivot
  and its two positions, not the square it is drawn in.
- **Screens that are not shown cost nothing**, so splitting a dense dashboard
  across screens buys frame budget directly; transitions are tear-free and do
  not tax the steady state. Widget timers and the slot controller skip instances
  whose screen is neither active nor animating out, and showing a screen wakes
  them once so it catches up on the next refresh. Graph widgets are the one
  exception — their sampler keeps running and the render is what drains its
  ring, so skipping one would lose history.
- **Verify, don't guess**: apply the document and read `render_us` and
  `lat_us` back over `@PR:DIAG`, with the FPS chip on the panel.

### Where an area's time goes

The split between walking the object tree and drawing holds whatever the
buffering. **The ESP32-S3 is CPU-bound**: 61% of an area is the software
blender at roughly 150 ns per pixel and another 29% is the tree walk, and a
changing readout costs three draw tasks — the screen background under it, the
widget's own fill and the label — at ~300 µs each. **The ESP32-P4 is not**: its
drawing is over in a few hundred microseconds, and the rest of the period is
the panel's. The direct-mode figures this was first measured under are in the
context of [ADR 0027](adr/0027-partial-render-buffers-and-unsynchronized-scan-out.md);
since it, the "sending" term is a strip copy and no board waits for scan-out.

### The ESP32-P4's accelerator, and why it is off

`LV_USE_PPA` is off in `sdkconfig.defaults.esp32p4`: with QIO flash and the
256 KB cache the software blender beats the blocking PPA fill at every size
measured, and the figures are in ADR 0027. The three PPA patches under
`firmware/patches/` stay, so re-evaluating the accelerator later — or making it
non-blocking — is a one-line Kconfig change. With it off a transparent widget
background is the cheapest of all.

### What 24-bit colour costs on the ESP32-P4

`PITRIG_DISPLAY_COLOR_DEPTH` offers the JC1060P470C 16-bit RGB565, which is
what it ships with, and 24-bit RGB888; `sdkconfig.defaults.color-24bit` selects
the second and raises `LV_COLOR_DEPTH` with it. The panel accepts both — at the
50 MHz pixel clock the DSI link carries 800 Mbit/s of RGB565 or 1200 of RGB888,
inside the 1500 the two lanes provide.

Three bytes a pixel are spent everywhere at once: the three panel frame buffers
grow 3.69 MB to 5.53 MB and the render strips 240 KB to 360 KB. The strips also
*move*: `esp_lvgl_port` refuses a DMA-capable buffer in any format but RGB565,
so an RGB888 build allocates them from external RAM, which is why the driver
sets `buffer_in_psram`. Measured against a 16-bit build whose strips were placed
the same way, with a full-width dashboard at a 60 Hz feed: a light screen falls
59 to 53 fps and a dense one 59 to 36 — render per frame +64 to +78%, flush
doubled from 6.7 to 12.9 ms, latency 22 to 39 ms. The cost is proportional to
the pixels a frame actually moves, so it lands on a busy screen and is barely
visible on a quiet one.

### Which composition mode full strips settles on

The strip-composed mode runs whichever of its two modes — repainting the whole
frame, or reconciling the untouched rows and drawing only the damage — it
measures as cheaper; both are tear-free, so the choice is purely about cost.
It measured the wrong one until the settle gate of ADR 0027's amendment: the
frames of a screen still composing repaint everything and pay the reconcile
copy on top, so every early sample favoured the widened mode, and a dense
dashboard ran at 47 fps where the other mode gives 59. Nothing is recorded now
until eight consecutive frames have covered less than half the screen (or four
seconds pass). Before against after, over the debugger's sixteen stress
patterns and the three Lovely screens: the Lovely main screen 59 fps on every
boot of six (was five of eight), `shapes_96` 33 to 59, `text_32_plain` 46 to 57,
`text_32` 50 to 55, `bars_24` 47 to 51, eleven unchanged; `full_screen_bar`
49 to 42 and `indicators_12` 58.5 to 54 pay for it, because the gate delays
electing the widened mode on the screens that want it.

### Where a frame's latency actually goes

A value reaches the panel about 22 ms after it lands in its slot, on a screen
whose drawing costs 4.5 ms, and the counters say why: on every screen fast
enough to reach the panel rate, `render_us + flush_us` comes out at roughly one
frame period whatever the screen holds — 1.98 + 13.61 ms on eight text widgets,
7.77 + 7.35 on sixteen. Flush absorbs what render does not, because the flush
worker holds a finished frame until the panel is ready for it: about a third of
the budget is drawing and two thirds waiting.

**The hold was also being spent at full processor.** LVGL waits for an
asynchronous flush with a bare `while(disp->flushing);` unless a
`flush_wait_cb` is installed, and the port installed none. One that sleeps a
tick until the port's pending-flush count reaches zero returns 27 points of
core 1 on average across the debugger's sixteen stress patterns (93.7% to
66.3%) and 79 points on the lightest (to 14.9%), with frame rate, latency and
cadence unchanged — a defect removed, not a trade. Only `text_64` and
`graphs_6` do not move; they never finish inside a period, so they were never
holding.

Removing the hold itself is a trade, so it is a build option rather than a
default: `CONFIG_PITRIG_DISPLAY_UNCAPPED` (`sdkconfig.defaults.uncapped`). It
halves what is left of the latency — the Lovely main screen 21.8 to 12.8 ms,
its fuel screen 12.5 to 7.9, `text_only` 23.3 to 7.4 — and lifts the frame rate
past what the panel shows, which means the processor draws frames nobody sees.
The numbers say what the latency would be without the hold, and nothing about
how the motion then looks.

### Scheduling the frame from the burst

The waiting is not half a period plus a hold; it is a whole refresh. LVGL sits
in the flush wait for the entire hold, so the burst of telemetry that arrives
during it is drawn only after the latch and shown one refresh later, and the
display stays a refresh behind because the feed is faster than the panel.
[ADR 0032](adr/0032-burst-scheduled-frames.md) answers this as
`CONFIG_PITRIG_DISPLAY_VSYNC_LOCK` (`sdkconfig.defaults.vsync-lock`, off by
default): each burst arms one frame start, and the before-and-after latencies
are in the ADR's table. The frame accounting it was found with is exported by
the debug build over `@PR:DIAG` and listed under Measurements above.

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
between changes. Animating photographs of the two screens instead, and merging
invalidated areas into a grid, were both measured and rejected — see
[ADR 0026](adr/0026-ui-memory-in-external-ram.md) and ADR 0027.
## Memory

Free internal RAM is constant on every board, whatever the dashboard holds,
because every LVGL allocation comes from external RAM ([ADR
0026](adr/0026-ui-memory-in-external-ram.md)). `@PR:DIAG` reports both heaps;
`internal_free` staying put across an `@PR:APPLY` is the expected result, and a
figure that moves with the document means something is allocating outside that
allocator. External RAM is what a dashboard spends: a distinct
`(family, size_px)` pair costs 4–12 KB of it depending on the pixel size, and an
image costs its own pixels. The per-type widget caps in the configuration
contract are therefore not a memory decision: raising one is a decision about
the frame, judged by applying the document and reading `render_us` back.
