# ADR 0027: Partial Render Buffers and Unsynchronized Scan-Out

Status: Accepted. Changes the display buffering the drivers of the Guition
ESP32-4848S040 and the Guition JC1060P470C hand to the LVGL port, raises the
4848S040's pixel clock, and grows the `esp_lvgl_port` patch stack beside the
DSI cache-safe callback patch that
[ADR 0026](0026-ui-memory-in-external-ram.md)-era work introduced.

## Context

Both RGB and DSI boards rendered in direct mode with `avoid_tearing`: LVGL drew
into the panel's own frame buffers and every flush blocked until the panel
finished scanning the frame out. That bought tear-free frames at the price of
latency and frame rate, measured end to end (telemetry commit →
`LV_EVENT_REFR_READY`) with the debug `lat_us` probe over `@PR:DIAG`:

- The 4848S040's 10 MHz pixel clock scans 480×480 with its porches at 35.2 Hz,
  so the board could not exceed 35 fps whatever the CPU did, every flush waited
  up to a whole 28 ms scan, and a dashboard of eight changing readouts at 60 Hz
  telemetry showed values 29–36 ms after they arrived.
- The JC1060P470C's DSI panel scans at 60 Hz, and the flush wait averaged half
  a period; under 60 Hz telemetry the pipeline queued to 23–25 ms of latency.

Partial mode — LVGL rendering 40/60-line strips in internal DMA RAM and
`draw_bitmap` copying them into the scanning frame buffer immediately — was
measured on both boards: latency halved on the 4848S040 (29 → 15 ms) and
dropped to 6–12 ms on the JC1060P470C at a full 60 fps, and the render itself
got faster because blending into an internal-RAM strip beats blending into the
PSRAM frame buffer. Raising the 4848S040's pixel clock to 16 MHz (56.4 Hz scan,
with 480×10 px bounce buffers to keep the PSRAM-fed panel stable) lifted its
frame-rate ceiling from 35 to 60+ fps. The T-Display-S3's i80 panel never
waited for scan-out, so it is unchanged.

## Decision

- Both boards hand the port partial buffers (two strips in internal DMA RAM),
  `avoid_tearing = false`, `direct_mode = false`. The 4848S040 runs its pixel
  clock at 16 MHz with 480×10 px bounce buffers.
- Tearing is accepted for widget updates: a strip lands in the frame buffer
  mid-scan, and for numeric readouts the artifact is a one-frame horizontal
  seam inside a glyph, judged worth 14–17 ms of latency on every value the
  dashboard shows. A screen change is the case it is not acceptable for — a
  slide invalidates the whole screen every frame and the seams read as the
  image breaking apart — so the navigation controller switches the display to
  tear-free rendering into the panel frame buffers for the duration of a
  transition (`lvgl_port_disp_set_tear_free`, the `tear-free-switch` port patch)
  and back to partial strips one refresh after the new screen has settled.
  DSI uses true direct mode, handed the buffer the panel is not scanning
  first — or the first transition frame paints in plain sight. RGB cannot
  render into its PSRAM frame buffers at all: blending is a read-modify-write
  through the cache, and with the 16 MHz bounce-buffer scan-out on the same
  bus the panel underruns — rows visibly sliding down the screen (direct and
  full mode both failed on the bench). So RGB keeps LVGL in partial mode, with
  the same internal-RAM strips and the same PSRAM traffic as the resting
  state, and the port's flush redirects each strip into the hidden frame
  buffer; the last strip of a frame that covered the whole screen swaps the
  buffers at the frame boundary. A frame that covered less does not swap — its
  strips wait in the hidden buffer for the next full animation frame, so a
  stray widget-only refresh cannot swap ghost content in. At rest the switch
  costs nothing; verified tear-free on both boards.
- The JC1060P470C's DPI panel copies each strip with DMA2D
  (`esp_lcd_dpi_panel_enable_dma2d`, called once when the panel is created).
  Without it `esp_lcd_panel_draw_bitmap` falls back to a per-line `memcpy`
  that not only spends a core but competes for the same PSRAM the renderer is
  blending into; handing the copy to the 2D engine lifted every dashboard
  pattern by 33-92% (text_16 61->106 fps, shapes_96 57->107, all_widgets
  57->96) and dropped *render* time by half on top of that, because the
  bandwidth the copy was taking went back to the blender. It is the largest
  single lever measured on this board.
- On the JC1060P470C the flush itself leaves the render core: the
  `flush-worker` port patch adds a small queue and a worker task pinned to core 0
  that runs `esp_lcd_panel_draw_bitmap`, waits out the transfer and completes
  the flush, so the LVGL task hands a strip over and immediately renders the
  next one into the second buffer. Draw-task profiling attributed 27–58% of
  the render core to the flush; moving it lifted every measured dashboard
  pattern by 13–36% (text_16 50→68 fps, text_32 30→39, bars_24 38→48) and cut
  value latency ~20%. A mode switch drains the queue first, so a transition
  never races an in-flight strip.
- The ESP32-P4 build also runs its flash in QIO instead of DIO and its L2
  cache at 256 KB instead of 128 (`sdkconfig.defaults.esp32p4`), together
  +38–47% before the flush move — the render core was starving on code and
  frame-buffer fetch, not on arithmetic. The 256 KB cache costs 128 KB of
  internal RAM, paid for by shrinking the render strips from 60 to 40 lines
  (measured free: −0–2%); with 60-line strips the second LVGL buffer no
  longer fits and startup lands in safe mode.
- `esp_lvgl_port` is patched by a stack of files under `firmware/patches/`,
  one concern each, in the order `apply_esp_lvgl_port_dsi_patch.cmake` lists
  them. The layers overlap, so the apply script checks the whole stack —
  forward, else reverse — in a temporary git index rather than one file at a
  time. The first, `esp-lvgl-port-2.8.0-dsi-cache-safe-flush.patch`, exists
  because upstream's DSI partial path defers `lv_disp_flush_ready` to the
  `on_color_trans_done` ISR, which under `CONFIG_LCD_DSI_ISR_CACHE_SAFE` must
  not reach flash-resident LVGL code or the PSRAM-resident display object. It
  mirrors the vsync path instead: the ISR only gives a semaphore held in
  internal RAM, and the flush callback waits on it and completes the flush
  from task context.
- What a debug build draws over the dashboard became a Kconfig choice
  (`PITRIG_DEBUG_OVERLAY`: full panel / FPS figure / nothing, default FPS).
  The full statistics panel blends a semi-transparent block over the widgets
  beneath it, which distorted every small-display measurement this decision
  was almost made against — with it on screen the T-Display-S3 measured 48 fps
  where 61 is real. The FPS figure is an opaque chip LVGL draws without
  touching anything under it, and its label is set only when the digit changes.

## Consequences

- Latency (commit → panel accepted) at 60 Hz telemetry, eight readouts:
  T-Display-S3 ~7 ms, 4848S040 ~8.5 ms, JC1060P470C ~6 ms. Sixty fps holds to
  roughly sixteen concurrently changing readouts on each board.
- The cost model of [runtime-performance.md](../runtime-performance.md)
  changes shape on the two boards: flush is a strip copy (2–4 ms a frame)
  rather than a scan-out wait — and on the JC1060P470C the copy runs on the
  core-0 worker, so `flush_us` there reads a hand-off of a few hundred
  microseconds and the frame budget is almost entirely render time. Figures in that document measured under direct mode are marked as such.
- A flash write during a flush is safe on the P4 only because the ISR touches
  nothing outside IRAM and internal RAM; the patches must be reviewed if
  `esp_lvgl_port` is upgraded past 2.8.0~1 (the apply script fails the build
  rather than guessing).
- The 4848S040 names its bounce buffers to the LVGL port (`bounce_buffers` in
  the driver configuration), because the port must bind the frame-complete
  event rather than vsync for the tear-free wait when bounce buffers stream
  the panel.
- The ESP32-P4's PPA is off (`LV_USE_PPA`): its blocking fills held the render
  core 168-445 us each while the software blender, fed by QIO and the larger
  cache, does the same work in a fraction of that — measured -13-25% frame
  rate on square-fill dashboards with the accelerator on, and a 32-readout
  grid of square panels at 22.8 ms a frame against 16.3 without. While it
  was on, rounded corners measured *faster* than square ones, because a
  rounded fill cannot go to the PPA. The PPA patches stay in
  `firmware/patches/` for a later re-evaluation.
- The JC1060P470C's buffering is a build-time choice
  (`PITRIG_DISPLAY_RENDER_MODE`): the strip-composed tear-free mode by default
  (see the amendment below), partial strips as the opt-out
  (`sdkconfig.defaults.render-partial`), and direct and full-screen modes for a
  build that trades frame rate for rendering straight into the panel's PSRAM
  buffers. Full was re-measured with PPA on and with two draw units and stays
  2-3x behind partial on every pattern — repainting the whole 614k-pixel frame
  into PSRAM is bandwidth-bound — and the tear-free builds skip the navigation
  controller's transition switching.
- Full mode (`sdkconfig.defaults.render-full`) gets a third panel frame buffer
  handed to LVGL (`lv_display_set_3rd_draw_buffer`), so a frame renders while
  the previous one is queued and a third is on screen, and the core-0 worker
  queues the swap throttled only by the vsync ISR's refresh counter. The
  fragment selects the 512 KB L2 cache with 128-byte lines, which fits only
  because full mode allocates no internal-RAM strips (~77 KB of internal RAM
  stays free with the debug overlay on — mind that headroom), and the text
  widget sizes its label to the box there, because the whole screen repaints
  anyway. Together the bench battery moved +29-115% over plain full mode
  (text_only 19.6→42.1 fps). `-O3` measured 1-2% behind `-O2` and stays
  rejected.
- The fourth option, `PITRIG_DISPLAY_RENDER_FULL_STRIPS` — now the default —
  is the tear-free mode closest to partial's frame rates. LVGL renders only the
  damage into 60-line internal-RAM strips; an AXI-GDMA channel carries each
  full-width strip into the hidden frame buffer and the CPU copies the narrow
  ones, while a reconcile task at the flush worker's priority copies the whole
  previous frame into that buffer on a second channel, in 96-row pieces fired
  at frame start, and strips wait only for the pieces they overlap. Every DMA
  wait carries a timeout that retires the engine to a CPU path rather than
  starving the pipeline into the watchdog. Reconciling only the stale
  rectangles was built first and removed — a bookkeeping gap showed as stale
  fill sectors on arcs, and the whole-frame copy hides behind any frame that
  renders longer than it copies — as was the DMA2D engine (`esp_async_fbcpy`),
  which wedges on narrow PSRAM destinations and, rarely but reproducibly, on
  full-width copies under load. The frame's last strip queues the swap and
  waits for the previous one to latch: rendering past the panel measured well
  above 60 fps and was rejected by eye, because irregular dropped frames read
  as judder, so the pipeline paces to the panel and every rendered frame is
  shown once. Paced, everything that can render at 60 locks to the panel
  (text_only, text_16, shapes_96, sprites_24 at 56-59 fps); below it sit
  all_widgets 43, text_32 37, graphs_6 35 and text_64 23 — the remaining gap
  to partial is the tear-free tax of the DMA crossing and the reconcile.
- Because repainting the whole screen is sometimes cheaper than reconciling it
  — image blits are cheap per pixel, text blending is not, and no static
  feature predicts which — the port measures both modes and runs the cheaper
  by an EMA of frame cost, widening the damage to the whole screen when the
  full pass wins, which is always correct. Probing the loser costs a slow
  frame, so it runs only where that frame cannot be seen: never while the
  winner holds the panel rate, and otherwise only while the loser's own
  average fits the budget the pacing is quantized to. A mode never measured is
  always probed; what a changed dashboard clears, and the settle gate that
  keeps a composing screen out of the measurement, are in the amendment on
  mode economics below. The choice stays bistable on dashboards whose
  damage-drawn frames spend most of their time on narrow copies, because the
  render-side clock cannot see the worker's tail; charging that tail,
  charging only the measured stalls, taking the larger pipeline half and rare
  paced A/B trials were each built, and each fixed one dashboard while
  breaking another — the residual is an open item.
- The graph widget samples on a task of its own, below the render pipeline
  (priority 2 against the flush worker's 5 and the render trigger's 4): the
  first version sampled on the shared `esp_timer` task at priority 22, starved
  the render trigger's watchdog feed and rebooted the board every few minutes.
  It once sampled inside the repaint, which halved a 16 ms interval on a
  32 fps dashboard; sampling on the telemetry event restored the rate but
  handed the plot the feed's jitter, so each sample now lands on a schedule and
  a late arrival still plots where it belongs. `lv_value_precise_t` is an
  integer unless `LV_USE_FLOAT`, so the ESP32-P4 build enables it and the
  widget keeps a sixteenth of a pixel through the ring, or a slow trace steps
  a whole row at a time.
- Levers re-measured against this configuration and rejected, so they are not
  tried again: merging invalidated areas into full-width rows (−27-65%), a
  second software draw unit (−35-67%), LVGL fast-mem in IRAM on the P4
  (±0-2%; the fragment stays S3-only), floats in place of the value pipeline's
  doubles (±0%), a full-screen PSRAM draw buffer, 400 MHz (panic-loop on chips
  below rev 3), a 64-byte PPA burst, an asynchronous PPA-SRM blit draw unit
  for RGB565 image copies (the fixed ~250-400 µs per transaction exceeds the
  software copy at every widget-sized image), and flattening the text widget
  into one box-sized label (the added blended pixels cost more than the
  re-layout they save).
- The panel-side vsync no longer paces LVGL, so a fast producer can render
  more frames than the panel shows; the extra frames cost CPU but not
  correctness. The per-type widget caps stay a frame decision, judged with
  `@PR:DIAG` as before.

## Amendment: the strip-composed mode is the default

The JC1060P470C now defaults to `PITRIG_DISPLAY_RENDER_FULL_STRIPS`. Partial
became the opt-out, appended as `sdkconfig.defaults.render-partial`, which also
puts the L2 line back to 64 bytes; the 128-byte line the strip mode wants moved
into `sdkconfig.defaults.esp32p4`, and `sdkconfig.defaults.render-full-strips`
is gone, because a fragment that selects the default states nothing.

No measurement changed. What changed is the reading of the seam this decision
accepted: it was argued for numeric readouts, where a strip lands mid-scan
inside a glyph for one frame. The artifact is not confined to them — every
widget that redraws a large area shows it, and the transition switch covers
only screen changes — so the seam is a property of the mode rather than a tax
on digits. The strip-composed mode is tear-free everywhere at frame rates in
partial's league (paced to the panel at 56-59 fps on every pattern that can
reach it), so the default now buys that correctness at the frames per second
the figures above already priced.

Partial remains what a dashboard reaches for when it needs the last frames per
second and its updates are small; its cost model in
[runtime-performance.md](../runtime-performance.md) is unchanged, and so is
everything the RGB boards do.

## Amendment: the mode economics measure only a settled screen

The choice between repainting the whole frame and reconciling the untouched
rows was being made from contaminated samples. Both modes started at a seeded
30 ms, a probed mode ran three or four frames before it was judged, and an
eighth-weight average cannot move from 30 to a real 9 in that time — so
whichever mode was probed first won, deterministically, and the loser was rarely
probed again. Seeding each mode from its first frame instead moved the
synthetic patterns but left the Lovely main screen choosing differently from
boot to boot: five boots of eight at 59 fps, three at 28. A 68-widget
composition exceeds `LV_INV_BUF_SIZE` on every frame until it settles, LVGL
then repaints the whole screen, and a whole-screen *partial* frame pays the
reconcile copy a widened frame skips — so every early sample is biased towards
widened, whatever the dashboard is really worth.

**Decision.** Nothing is recorded until the screen stops changing shape. A
settle gate stays shut until eight consecutive frames have covered less than
half the screen, or four seconds have passed for a dashboard whose ordinary
damage really is the whole screen. While it is shut the display keeps drawing
whichever mode is believed — both are correct — but nothing is measured and
nothing is probed. Once open, each mode seeds from the cheapest of its first
four frames, because frame cost has a hard floor and a one-sided tail. Two
events that used to share one threshold are told apart: ordinary drift in the
winner's cost, by half, only stops the loser being believed and lets it be
probed again; a move by a factor of four means the dashboard was replaced and
shuts the gate. The cost a frame is charged is its span minus the time slept
in the flush wait, so the previous swap's hold cannot leak into it
([ADR 0032](0032-burst-scheduled-frames.md)).

**Consequences.** The Lovely main screen is 59 fps on every boot of six
(render 4.6 ms, latency 21 ms); over the debugger's sixteen stress patterns
`shapes_96` went 33 to 59 fps, `text_32_plain` 46 to 57, `text_32` 50 to 55,
`bars_24` 47 to 51, and eleven did not move. Two pay for it — `full_screen_bar`
49 to 42 and `indicators_12` 58.5 to 54 — because the gate delays electing the
widened mode on the screens that want it most.
