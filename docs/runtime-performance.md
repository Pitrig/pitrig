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
  fewer frames without being late. A board that waits for the panel before
  reusing a frame buffer also cannot exceed the panel refresh rate; the Guition
  JC1060P470C scans at 60.0 Hz.
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

The service owns measurement and aggregation. The dashboard widget only reads
the latest statistics snapshot and formats it for display.

Dashboard glyphs are rasterized from the uploaded font faces and cached per
font in external RAM. Composition pre-warms the characters a dashboard draws,
so a steady-state frame performs no rasterization; a character outside the warm
set shows up as one longer frame in **Max** and is cached afterwards.
